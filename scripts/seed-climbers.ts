/**
 * Seed 20 parody-climber profiles into a gym's current set for UX
 * testing. Each climber gets a randomised set of route_logs
 * (attempts / completed / zone / grade_vote) so the leaderboard,
 * chorkboard and profile pages have realistic data to render.
 *
 * Usage:
 *   npx tsx scripts/seed-climbers.ts
 *   npx tsx scripts/seed-climbers.ts --cleanup   # remove seeded users
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY in `.env.local`.
 *
 * Idempotency: seeded users are tagged by an `email` starting with
 * `seed+<slug>@chork.test` so we can find + wipe them without
 * touching real accounts. Re-running without `--cleanup` is safe:
 * existing seed users are left alone.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const SEED_DOMAIN = "chork.test";

// 20 parodies of real climbers / climbing YouTubers. Names chosen so
// a real climber's fans will recognise the reference without any
// chance of the seed data being mistaken for the real person.
const SEED_CLIMBERS = [
  { username: "magnus_meatbjorn",    name: "Magnus Meatbjørn" },
  { username: "adam_shandra",        name: "Adam Shandra" },
  { username: "alex_hardold",        name: "Alex Hardold" },
  { username: "emil_brokenberger",   name: "Emil Brokenberger" },
  { username: "sasha_degrabbit",     name: "Sasha DeGrabbit" },
  { username: "mina_heartss",        name: "Mina Heartss" },
  { username: "sean_mybaby",         name: "Sean MyBaby" },
  { username: "lynn_hull",           name: "Lynn Hull" },
  { username: "dave_gravelgrinder",  name: "Dave the Gravelgrinder" },
  { username: "hazel_shoes",         name: "Hazel Shoes" },
  { username: "beth_roddling",       name: "Beth Roddling" },
  { username: "chris_sharmageddon",  name: "Chris Sharmageddon" },
  { username: "daniel_woodstock",    name: "Daniel Woodstock" },
  { username: "katie_brownage",      name: "Katie Brownage" },
  { username: "tommy_cadwell",       name: "Tommy Cadwell" },
  { username: "angela_eyehole",      name: "Angela Eyehole" },
  { username: "jakob_schuberg",      name: "Jakob Schuberg" },
  { username: "laura_rogabeata",     name: "Laura Rogabeata" },
  { username: "shauna_coxisted",     name: "Shauna Coxisted" },
  { username: "jim_helping",         name: "Jim Helping" },
];

function rand<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function findGym(slug?: string) {
  const q = supabase.from("gyms").select("id, name, slug").limit(1);
  const { data } = slug ? await q.eq("slug", slug) : await q.order("created_at");
  return data?.[0] ?? null;
}

async function cleanup() {
  console.log("Finding seeded users…");
  const { data: users, error } = await (supabase.auth.admin as any).listUsers();
  if (error) throw error;
  const seeded = users.users.filter((u: any) =>
    u.email?.endsWith(`@${SEED_DOMAIN}`),
  );
  console.log(`  found ${seeded.length}`);
  for (const u of seeded) {
    await (supabase.auth.admin as any).deleteUser(u.id);
    process.stdout.write(".");
  }
  console.log("\nDone.");
}

async function main() {
  if (process.argv.includes("--cleanup")) {
    await cleanup();
    return;
  }

  const gym = await findGym();
  if (!gym) {
    console.error("No gym found. Create one first (or run scripts/seed-set.ts).");
    process.exit(1);
  }
  console.log(`Seeding into gym: ${gym.name} (${gym.id})`);

  const { data: activeSet } = await supabase
    .from("sets")
    .select("id, name")
    .eq("gym_id", gym.id)
    .eq("status", "live")
    .maybeSingle();
  if (!activeSet) {
    console.error("No live set. Publish one before seeding climbers.");
    process.exit(1);
  }
  console.log(`Active set: ${activeSet.name} (${activeSet.id})`);

  const { data: routes } = await supabase
    .from("routes")
    .select("id, number, has_zone")
    .eq("set_id", activeSet.id)
    .order("number");
  if (!routes || routes.length === 0) {
    console.error("Active set has no routes.");
    process.exit(1);
  }
  console.log(`Routes: ${routes.length}`);

  let created = 0;
  let skipped = 0;

  for (const climber of SEED_CLIMBERS) {
    const email = `seed+${climber.username}@${SEED_DOMAIN}`;
    // createUser is idempotent across reruns — we catch the "already
    // registered" error and move on.
    const { data: createRes, error: createErr } = await (supabase.auth.admin as any).createUser({
      email,
      password: crypto.randomUUID(),
      email_confirm: true,
      user_metadata: { seed: true, name: climber.name },
    });

    let userId: string | null = createRes?.user?.id ?? null;
    if (createErr || !userId) {
      // Already exists — look up by email via admin listing.
      const { data: list } = await (supabase.auth.admin as any).listUsers();
      const existing = list.users.find((u: any) => u.email === email);
      if (!existing) {
        console.warn(`  ${climber.username}: create failed`, createErr);
        continue;
      }
      userId = existing.id;
      skipped += 1;
    } else {
      created += 1;
    }

    // Random theme per seed climber so visiting their profile
    // exercises the per-route theme switch added in migration 028.
    // Defaults are weighted toward the brand palette so a fresh
    // visit still feels familiar.
    const themePool = [
      "default", "default", "default",
      "slate", "sand", "gray", "mauve", "sage",
    ];

    // Update profile (created by trigger) with username + name +
    // active gym. Use upsert so the first run's auto-trigger and
    // subsequent runs converge to the same state.
    await supabase
      .from("profiles")
      .update({
        username: climber.username,
        name: climber.name,
        onboarded: true,
        active_gym_id: gym.id,
        theme: rand(themePool),
      })
      .eq("id", userId);

    // Make them a gym member if not already.
    await supabase
      .from("gym_memberships")
      .upsert(
        { user_id: userId, gym_id: gym.id, role: "climber" },
        { onConflict: "user_id,gym_id" },
      );

    // Random log distribution per route. ~65% attempt rate; of those,
    // ~55% complete; of completions, ~25% are flashes. Zone claimed
    // on ~35% of zone-available routes.
    for (const route of routes) {
      if (Math.random() > 0.65) continue;
      const flashed = Math.random() < 0.25;
      const completed = flashed || Math.random() < 0.55;
      const attempts = flashed ? 1 : randInt(completed ? 2 : 1, completed ? 5 : 3);
      const zone = route.has_zone && Math.random() < 0.35;
      const grade_vote = completed && Math.random() < 0.5 ? randInt(2, 7) : null;

      await supabase
        .from("route_logs")
        .upsert(
          {
            user_id: userId,
            route_id: route.id,
            gym_id: gym.id,
            attempts,
            completed,
            zone,
            grade_vote,
            completed_at: completed ? new Date().toISOString() : null,
          },
          { onConflict: "user_id,route_id" },
        );
    }

    process.stdout.write(".");
  }
  console.log(`\nDone. created=${created} skipped=${skipped}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
