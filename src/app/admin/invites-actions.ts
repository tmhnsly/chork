"use server";

import { gateGymAdminMutation, gateSignedInMutation } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { formatError, formatErrorForLog } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { EMAIL_RE } from "@/lib/validation";
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
  const auth = await gateSignedInMutation(inviteId, "invite");
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
  // A privilege grant: this seats the caller as a gym admin. The
  // token is opaque, not a uuid, so the gate gets no resource id —
  // the rate limit is the point here (see auth.ts, gateSignedInMutation).
  const auth = await gateSignedInMutation(null, "invite");
  if ("error" in auth) return { error: auth.error };

  // Runs under the service role so the chicken-and-egg check on
  // gym_admins INSERT (which requires an existing owner) is bypassed
  // once the token has been proven valid.
  const service = createServiceClient();
  const { data: user } = await service.auth.admin.getUserById(auth.userId);
  const email = user?.user?.email;
  if (!email) return { error: "Could not read your email address." };

  const { data: invite, error } = await service
    .from("gym_invites")
    .select("id, gym_id, email, role, accepted_at, expires_at")
    .eq("token", token)
    .maybeSingle();

  if (error || !invite) {
    return { error: "Invite not found." };
  }
  if (invite.accepted_at) {
    return { error: "This invite has already been used." };
  }
  if (new Date(invite.expires_at).getTime() < Date.now()) {
    return { error: "This invite has expired." };
  }
  if (invite.email.toLowerCase() !== email.toLowerCase()) {
    return { error: "This invite was issued to a different email address." };
  }

  const role = invite.role as "admin" | "owner";

  const { error: adminErr } = await service.from("gym_admins").upsert(
    {
      gym_id: invite.gym_id,
      user_id: auth.userId,
      role,
    },
    { onConflict: "gym_id,user_id" },
  );
  if (adminErr) return { error: formatError(adminErr) };

  const { error: markErr } = await service
    .from("gym_invites")
    .update({ accepted_at: new Date().toISOString() })
    .eq("id", invite.id);
  if (markErr) {
    // Admin row is already inserted; this is a minor accounting
    // failure, not a blocker for the invitee.
    logger.warn("could_not_mark_invite_accepted_failed", {
      err: formatErrorForLog(markErr),
    });
  }

  // Same reasoning as signupGym — gym_admins isn't cached and adminGyms
  // re-fetches via the action response. Profile row unchanged.
  return { success: true, gymId: invite.gym_id };
}
