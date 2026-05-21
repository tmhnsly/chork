"use server";

import { revalidateTag } from "next/cache";
import { requireGymAdmin } from "@/lib/auth";
import { formatError } from "@/lib/errors";
import type { RouteSet } from "@/lib/data";
import type { ActionResult } from "@/lib/action-result";

import { tags } from "@/lib/cache/tags";

/**
 * Home-page quick-create flow used by `CreateSetForm` when an admin
 * lands on the Wall with no active set. The full set editor lives at
 * `/admin/sets/new`; this is the 30-second shortcut.
 *
 * Auth: `requireGymAdmin(gymId)` reads the `gym_admins` table — the
 * canonical admin source of truth per CLAUDE.md. Do NOT switch back
 * to the legacy `gym_memberships.role` gate; that table's role column
 * is cosmetic and bypassing it lets a stale role grant set-management.
 *
 * Status: writes `status: "live"` directly. The legacy `active`
 * boolean is derived from `status` via the migration 003 trigger;
 * old readers of `active` keep working without code changes.
 */
export async function createSet(
  gymId: string,
  startsAt: string,
  endsAt: string,
  routeCount: number,
  zoneRoutes: number[] // route numbers that have zone holds
): Promise<ActionResult<{ set: RouteSet }>> {
  if (!gymId) return { error: "No gym selected" };
  if (!startsAt || !endsAt) return { error: "Start and end dates are required" };
  if (routeCount < 1 || routeCount > 50) return { error: "Route count must be between 1 and 50" };

  const auth = await requireGymAdmin(gymId);
  if ("error" in auth) return { error: auth.error };
  const { supabase } = auth;

  try {
    // Archive any existing live set for this gym so the new one is
    // unambiguously "the live set". The trigger on `sets` derives
    // `active = (status = 'live')`, so old readers of `active` still
    // see the right value after the status flip.
    await supabase
      .from("sets")
      .update({ status: "archived" })
      .eq("gym_id", gymId)
      .eq("status", "live");

    // Create the new set
    const { data: set, error: setError } = await supabase
      .from("sets")
      .insert({
        gym_id: gymId,
        starts_at: startsAt,
        ends_at: endsAt,
        status: "live",
      })
      .select()
      .single();

    if (setError || !set) return { error: formatError(setError) };

    // Create routes
    const routes = Array.from({ length: routeCount }, (_, i) => ({
      set_id: set.id,
      number: i + 1,
      has_zone: zoneRoutes.includes(i + 1),
    }));

    const { error: routesError } = await supabase
      .from("routes")
      .insert(routes);

    if (routesError) return { error: formatError(routesError) };

    revalidateTag(tags.gymActiveSet(gymId), "max");
    revalidateTag(tags.setRoutes(set.id), "max");
    return { success: true, set };
  } catch (err) {
    return { error: formatError(err) };
  }
}

/**
 * End the current live set (transitions status → archived). Same
 * auth + status notes as `createSet` above.
 */
export async function endSet(
  gymId: string,
  setId: string
): Promise<ActionResult> {
  const auth = await requireGymAdmin(gymId);
  if ("error" in auth) return { error: auth.error };
  const { supabase } = auth;

  try {
    const { error } = await supabase
      .from("sets")
      .update({ status: "archived" })
      .eq("id", setId)
      .eq("gym_id", gymId);

    if (error) return { error: formatError(error) };

    revalidateTag(tags.gymActiveSet(gymId), "max");
    revalidateTag(tags.setLeaderboard(setId), "max");
    return { success: true };
  } catch (err) {
    return { error: formatError(err) };
  }
}
