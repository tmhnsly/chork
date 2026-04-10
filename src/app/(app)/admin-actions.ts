"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth";
import { getUserGymRole, isGymAdmin } from "@/lib/data/queries";
import { formatError } from "@/lib/errors";
import type { RouteSet, Route } from "@/lib/data";

type AdminResult<T = unknown> = { error: string } | ({ success: true } & T);

/**
 * Create a new set with routes. Deactivates any existing active set.
 */
export async function createSet(
  gymId: string,
  startsAt: string,
  endsAt: string,
  routeCount: number,
  zoneRoutes: number[] // route numbers that have zone holds
): Promise<AdminResult<{ set: RouteSet }>> {
  if (!gymId) return { error: "No gym selected" };
  if (!startsAt || !endsAt) return { error: "Start and end dates are required" };
  if (routeCount < 1 || routeCount > 50) return { error: "Route count must be between 1 and 50" };

  const auth = await requireAuth();
  if ("error" in auth) return { error: auth.error };
  const { supabase, userId } = auth;

  // Check admin role
  const role = await getUserGymRole(supabase, userId, gymId);
  if (!isGymAdmin(role)) {
    return { error: "You don't have permission to manage sets for this gym" };
  }

  try {
    // Deactivate existing active sets for this gym
    await supabase
      .from("sets")
      .update({ active: false })
      .eq("gym_id", gymId)
      .eq("active", true);

    // Create the new set
    const { data: set, error: setError } = await supabase
      .from("sets")
      .insert({
        gym_id: gymId,
        starts_at: startsAt,
        ends_at: endsAt,
        active: true,
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

    revalidatePath("/", "layout");
    return { success: true, set };
  } catch (err) {
    return { error: formatError(err) };
  }
}

/**
 * End the current active set (deactivate it).
 */
export async function endSet(
  gymId: string,
  setId: string
): Promise<AdminResult> {
  const auth = await requireAuth();
  if ("error" in auth) return { error: auth.error };
  const { supabase, userId } = auth;

  const role = await getUserGymRole(supabase, userId, gymId);
  if (!isGymAdmin(role)) {
    return { error: "You don't have permission to manage sets for this gym" };
  }

  try {
    const { error } = await supabase
      .from("sets")
      .update({ active: false })
      .eq("id", setId)
      .eq("gym_id", gymId);

    if (error) return { error: formatError(error) };

    revalidatePath("/", "layout");
    return { success: true };
  } catch (err) {
    return { error: formatError(err) };
  }
}
