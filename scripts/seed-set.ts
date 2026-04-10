/**
 * Seed a new set with routes for a gym.
 *
 * Usage:
 *   npx tsx scripts/seed-set.ts
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY in .env.local
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  // Find Yonder gym
  const { data: gym } = await supabase
    .from("gyms")
    .select("id, name")
    .eq("slug", "yonder")
    .single();

  if (!gym) {
    console.error("Yonder gym not found. Run the initial migration first.");
    process.exit(1);
  }

  console.log(`Found gym: ${gym.name} (${gym.id})`);

  // Deactivate any existing active sets
  await supabase
    .from("sets")
    .update({ active: false })
    .eq("gym_id", gym.id)
    .eq("active", true);

  // Create a new active set
  const startsAt = new Date();
  const endsAt = new Date();
  endsAt.setDate(endsAt.getDate() + 28); // 4 weeks

  const { data: set, error: setError } = await supabase
    .from("sets")
    .insert({
      gym_id: gym.id,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      active: true,
    })
    .select()
    .single();

  if (setError || !set) {
    console.error("Failed to create set:", setError);
    process.exit(1);
  }

  console.log(`Created set: ${set.id} (${startsAt.toLocaleDateString()} – ${endsAt.toLocaleDateString()})`);

  // Create 14 routes — some with zone holds
  const routes = Array.from({ length: 14 }, (_, i) => ({
    set_id: set.id,
    number: i + 1,
    has_zone: i % 3 === 0, // routes 1, 4, 7, 10, 13 have zone
  }));

  const { error: routesError } = await supabase
    .from("routes")
    .insert(routes);

  if (routesError) {
    console.error("Failed to create routes:", routesError);
    process.exit(1);
  }

  console.log(`Created ${routes.length} routes`);
  console.log("Done! The set is now active.");
}

main();
