"use server";

import { gateGymAdminMutation, requireSignedIn } from "@/lib/auth";
import { acceptGymInvite } from "@/lib/data/admin-mutations";
import { createServiceClient } from "@/lib/supabase/server";
import { formatError } from "@/lib/errors";
import { UUID_RE, EMAIL_RE } from "@/lib/validation";
import { env } from "@/lib/env";
import { randomBytes } from "node:crypto";

import type { ActionResult } from "@/lib/action-result";

// ────────────────────────────────────────────────────────────────
// Invites
// ────────────────────────────────────────────────────────────────

export async function sendAdminInvite(form: {
  gymId: string;
  email: string;
  role: "admin" | "owner";
}): Promise<ActionResult<{ inviteUrl: string }>> {
  const email = (form.email ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return { error: "Enter a valid email address." };
  if (!["admin", "owner"].includes(form.role)) {
    return { error: "Invalid role." };
  }

  // UUID validate + requireGymAdmin + invitesSend rate-limit, in one
  // call. See gateGymAdminMutation for the rationale on bundling.
  const auth = await gateGymAdminMutation(form.gymId, "gym", {
    rateLimit: "invitesSend",
  });
  if ("error" in auth) return { error: auth.error };
  const { userId, gymId } = auth;

  // Only owners can issue owner-level invites. Admins can invite peers.
  if (form.role === "owner" && !auth.isOwner) {
    return { error: "Only owners can invite other owners." };
  }

  // Opaque, URL-safe, single-use token. 32 bytes → 43 chars base64url.
  const token = randomBytes(32).toString("base64url");

  // Both timestamps are app-supplied rather than relying on column
  // defaults. The column defaults (migration 014: `now()` and
  // `now() + interval '14 days'`) only fire on INSERT, not UPDATE —
  // and this is an upsert on (gym_id, email). The "admin re-invites
  // the same email after expiry" flow has to refresh the window, so
  // on the UPDATE path we need to overwrite `expires_at` explicitly;
  // omitting it would leave the original (possibly expired) value
  // in place and quietly make the re-invite useless.
  //
  // Node clock drift is minor on Vercel (NTP-synced fleet) and the
  // regression-on-omission is worse than the drift risk.
  const now = new Date();
  const { error } = await auth.supabase.from("gym_invites").upsert(
    {
      gym_id: gymId,
      email,
      role: form.role,
      token,
      invited_by: userId,
      invited_at: now.toISOString(),
      expires_at: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      accepted_at: null,
    },
    { onConflict: "gym_id,email" }
  );

  if (error) return { error: formatError(error) };

  // gym_invites isn't in the cache layer; the admin invites list
  // re-fetches automatically via the server action's response cycle.
  // No revalidateTag needed.

  // The server action returns the URL so the caller (admin UI) can
  // show a copy-link button. Email delivery wiring lands with the
  // push / notifications infrastructure in a subsequent phase.
  // `env.SITE_URL` is validated at module load — a missing env var
  // fails the build rather than shipping a relative URL that can't
  // be pasted into a chat.
  return { success: true, inviteUrl: `${env.SITE_URL}/admin/invite/${token}` };
}

export async function cancelAdminInvite(inviteId: string): Promise<ActionResult> {
  if (!UUID_RE.test(inviteId)) return { error: "Invalid invite." };

  const auth = await requireSignedIn();
  if ("error" in auth) return { error: auth.error };

  // gym_invites DELETE is RLS-gated to `is_gym_admin(gym_id)` (migration
  // 014), so one atomic delete + returning both authorises AND executes
  // the action — no separate service-role lookup, no TOCTOU window
  // between "check admin" and "delete". `.select("id")` tells the
  // client to return affected rows; empty array == "not found OR not
  // authorised" (we collapse the two so we don't leak invite existence).
  const { data, error } = await auth.supabase
    .from("gym_invites")
    .delete()
    .eq("id", inviteId)
    .select("id");
  if (error) return { error: formatError(error) };
  if (!data || data.length === 0) return { error: "Invite not found." };

  return { success: true };
}

export async function acceptAdminInvite(token: string): Promise<ActionResult<{ gymId: string }>> {
  if (typeof token !== "string" || token.length < 20) {
    return { error: "Invalid invite link." };
  }
  const auth = await requireSignedIn();
  if ("error" in auth) return { error: auth.error };

  const service = createServiceClient();
  const { data: user } = await service.auth.admin.getUserById(auth.userId);
  const email = user?.user?.email;
  if (!email) return { error: "Could not read your email address." };

  const result = await acceptGymInvite({
    token,
    acceptingUserId: auth.userId,
    acceptingEmail: email,
  });
  if ("error" in result) return { error: result.error };

  // Same reasoning as signupGym — gym_admins isn't cached and adminGyms
  // re-fetches via the action response. Profile row unchanged.
  return { success: true, gymId: result.gymId };
}
