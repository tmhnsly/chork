"use server";

import { requireSignedIn } from "@/lib/auth";
import { createGymWithOwner } from "@/lib/data/admin-mutations";
import { enforce as enforceRateLimit } from "@/lib/rate-limit";
import type { ActionResult } from "@/lib/action-result";

// Lowercase letters, digits, single hyphens — matches the gym-slug
// shape elsewhere in the app (see migration 001).
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

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

  const result = await createGymWithOwner(auth.supabase, {
    name,
    slug,
    city,
    country,
    plan_tier: planTier,
  });

  if ("error" in result) return { error: result.error };

  // signupGym writes a new gyms row + an admin seat, but doesn't touch
  // profiles.* — getAdminGymsForUser is uncached and re-fetches via the
  // server action's response cycle, so no profile-tag bust required.
  return { success: true, gymId: result.gymId };
}
