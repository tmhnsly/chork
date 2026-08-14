"use server";

import { requireSignedIn } from "@/lib/auth";
import { formatError } from "@/lib/errors";
import { enforce as enforceRateLimit } from "@/lib/rate-limit";
import type { ActionResult } from "@/lib/action-result";
import { SLUG_RE } from "@/lib/validation";

// ────────────────────────────────────────────────────────────────
// Gym signup — new admin creates a gym
// ────────────────────────────────────────────────────────────────

export async function signupGym(form: {
  name: string;
  slug: string;
  city: string;
  country: string;
  planTier: "starter" | "pro" | "enterprise";
}): Promise<ActionResult<{ gymId: string }>> {
  const name = (form.name ?? "").trim();
  const slug = (form.slug ?? "").trim().toLowerCase();
  const city = (form.city ?? "").trim() || null;
  const country = (form.country ?? "").trim() || null;
  const planTier = form.planTier;

  if (name.length < 2 || name.length > 80) {
    return { error: "Gym name must be 2–80 characters." };
  }
  if (!SLUG_RE.test(slug)) {
    return { error: "Slug must be lowercase letters, digits, and hyphens." };
  }
  if (!["starter", "pro", "enterprise"].includes(planTier)) {
    return { error: "Invalid plan tier." };
  }

  const auth = await requireSignedIn();
  if ("error" in auth) return { error: auth.error };

  // Rate-limit: gym signups are rare in legitimate use (one per
  // admin onboarding session). Without this, a single authed user
  // could mass-create gym rows — `gyms.name` has no uniqueness
  // constraint, so spam wouldn't even fail at the DB layer until
  // the per-call slug collision check. See lib/rate-limit.ts for
  // bucket sizing.
  const rl = await enforceRateLimit("gymSignup", auth.userId);
  if (!rl.ok) return { error: rl.error };

  // create_gym_with_owner_tx (migration 061): both inserts (gyms +
  // gym_admins) happen in one implicit transaction, so a failure on
  // the second insert rolls the first back automatically. The RPC is
  // SECURITY DEFINER and derives the owner uid from auth.uid() inside
  // the function — the caller can't seat a different user.
  //
  // Migration 062 reordered the function so p_city / p_country trail
  // p_plan_tier with DEFAULT NULL — the type generator marks them
  // optional, so omit (rather than send null) when absent to let the
  // DB-side defaults take over.
  const { data, error } = await auth.supabase.rpc("create_gym_with_owner_tx", {
    p_name: name,
    p_slug: slug,
    p_plan_tier: planTier,
    ...(city !== null && { p_city: city }),
    ...(country !== null && { p_country: country }),
  });

  if (error || !data) {
    if (error?.code === "23505") {
      return { error: "That gym slug is already taken." };
    }
    return { error: error ? formatError(error) : "Could not create gym." };
  }

  // signupGym writes a new gyms row + an admin seat, but doesn't touch
  // profiles.* — getAdminGymsForUser is uncached and re-fetches via the
  // server action's response cycle, so no profile-tag bust required.
  return { success: true, gymId: data };
}
