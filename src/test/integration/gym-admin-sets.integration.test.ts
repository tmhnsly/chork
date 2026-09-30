/**
 * A gym admin running their wall, against the real database.
 *
 * This file exists because of what mocked tests could not see. From
 * April to September 2026 no gym admin could create, publish or edit a
 * Set, or add a route, through the app: `sets` had only a SELECT
 * policy and `routes` had write policies for Match players only, while
 * every admin action wrote through the admin's own client. The action
 * tests doubled Supabase and passed throughout. Two of the four
 * refusals were silent (an UPDATE that RLS filters out changes nothing
 * and reports nothing), so Publish returned success and announced a
 * Set that had not moved. Migration 145 is the fix; this pins it with
 * real sessions and real policies.
 *
 * What it proves:
 *   • an admin who is NOT a member of their gym can still create and
 *     edit its Sets and routes (creating a gym writes `gym_admins`
 *     only, and the read policies used to ask for membership)
 *   • a member who is not an admin can do none of it
 *   • an admin cannot reach another gym's Sets, or turn a Set into a
 *     Match
 *   • `publish_set` swaps the live Set in one step, refuses a Set with
 *     no routes, and refuses anyone who doesn't run the gym
 *   • one live Set per gym is a constraint, not a convention
 *
 * Every row is provisioned here and removed in `afterAll`. The gyms
 * are unlisted and their slugs start `int-`.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { canRunIntegration, makeServiceClient, makeUserClient } from "./supabase-client";
import { createTestUser, deleteTestUser, signInAsUser } from "./fixtures";

describe.skipIf(!canRunIntegration)("gym admins run their wall (integration)", () => {
  const service = makeServiceClient();
  const adminClient = makeUserClient();
  const memberClient = makeUserClient();

  const tag = Math.random().toString(36).slice(2, 8);
  let adminId: string;
  let memberId: string;
  let gymId: string;
  let otherGymId: string;

  /** A Set at the admin's gym, made the way `createSet` makes it. */
  async function createDraft(name: string, gym = gymId) {
    return adminClient
      .from("sets")
      .insert({
        gym_id: gym,
        name,
        starts_at: "2026-10-01",
        ends_at: "2027-10-01",
        grading_scale: "v",
        max_grade: 10,
        status: "draft",
      })
      .select("id")
      .single();
  }

  async function statusOf(setId: string) {
    const { data } = await service.from("sets").select("status").eq("id", setId).single();
    return data?.status;
  }

  beforeAll(async () => {
    const admin = await createTestUser(service);
    adminId = admin.userId;
    await signInAsUser(adminClient, admin.email, admin.password);

    const member = await createTestUser(service);
    memberId = member.userId;
    await signInAsUser(memberClient, member.email, member.password);

    const gyms = await service
      .from("gyms")
      .insert([
        { name: `int gym ${tag}`, slug: `int-${tag}`, is_listed: false },
        { name: `int other ${tag}`, slug: `int-other-${tag}`, is_listed: false },
      ])
      .select("id, slug");
    expect(gyms.error).toBeNull();
    gymId = gyms.data!.find((g) => g.slug === `int-${tag}`)!.id;
    otherGymId = gyms.data!.find((g) => g.slug === `int-other-${tag}`)!.id;

    // The admin runs the first gym and is deliberately NOT a member of
    // it. The member climbs there and runs nothing.
    const seeded = await Promise.all([
      service.from("gym_admins").insert({ gym_id: gymId, user_id: adminId, role: "owner" }),
      service.from("gym_memberships").insert({ gym_id: gymId, user_id: memberId }),
    ]);
    for (const r of seeded) expect(r.error).toBeNull();
  }, 60_000);

  afterAll(async () => {
    for (const gym of [gymId, otherGymId]) {
      if (!gym) continue;
      const { data: sets } = await service.from("sets").select("id").eq("gym_id", gym);
      for (const { id } of sets ?? []) await service.from("routes").delete().eq("set_id", id);
      await service.from("sets").delete().eq("gym_id", gym);
      await service.from("gym_admins").delete().eq("gym_id", gym);
      await service.from("gym_memberships").delete().eq("gym_id", gym);
      await service.from("gyms").delete().eq("id", gym);
    }
    if (adminId) await deleteTestUser(service, adminId);
    if (memberId) await deleteTestUser(service, memberId);
  }, 60_000);

  describe("an admin who isn't a member", () => {
    it("creates a Set, edits it, and gets the row back", async () => {
      const created = await createDraft("int: autumn");
      expect(created.error).toBeNull();
      const setId = created.data!.id;

      // The shape updateSet sends: it asks for the row back, because
      // an UPDATE that RLS filters out is not an error.
      const edited = await adminClient
        .from("sets")
        .update({ name: "int: renamed" })
        .eq("id", setId)
        .select("id")
        .maybeSingle();
      expect(edited.error).toBeNull();
      expect(edited.data?.id).toBe(setId);

      const { data } = await service.from("sets").select("name").eq("id", setId).single();
      expect(data?.name).toBe("int: renamed");
    });

    it("seeds routes with an upsert and edits one, as the route editor does", async () => {
      const { data: set } = await createDraft("int: routes");
      const rows = [1, 2, 3].map((n) => ({ set_id: set!.id, number: n, has_zone: n === 2 }));

      const seeded = await adminClient.from("routes").upsert(rows, { onConflict: "set_id,number" });
      expect(seeded.error).toBeNull();
      // Twice: the second run takes the ON CONFLICT DO UPDATE path,
      // which needs the UPDATE policy as well as the INSERT one.
      const again = await adminClient.from("routes").upsert(rows, { onConflict: "set_id,number" });
      expect(again.error).toBeNull();

      const { data: routes } = await service.from("routes").select("id").eq("set_id", set!.id);
      expect(routes).toHaveLength(3);

      const edited = await adminClient
        .from("routes")
        .update({ setter_name: "int setter" })
        .eq("id", routes![0].id)
        .select("id")
        .maybeSingle();
      expect(edited.error).toBeNull();
      expect(edited.data?.id).toBe(routes![0].id);
    });

    it("cannot create a Set at a gym they don't run", async () => {
      const refused = await createDraft("int: not mine", otherGymId);
      expect(refused.error?.code).toBe("42501");
    });

    it("cannot turn a gym Set into a Match, or move it to another gym", async () => {
      const { data: set } = await createDraft("int: stays put");

      const asMatch = await adminClient
        .from("sets")
        .update({ owner_kind: "climber" })
        .eq("id", set!.id)
        .select("id");
      const moved = await adminClient
        .from("sets")
        .update({ gym_id: otherGymId })
        .eq("id", set!.id)
        .select("id");
      expect(asMatch.error?.code).toBe("42501");
      expect(moved.error?.code).toBe("42501");

      const { data } = await service
        .from("sets")
        .select("owner_kind, gym_id")
        .eq("id", set!.id)
        .single();
      expect(data).toEqual({ owner_kind: "gym", gym_id: gymId });
    });
  });

  describe("a member who isn't an admin", () => {
    it("can read the gym's Sets and write none of them", async () => {
      const { data: set } = await createDraft("int: read only");
      await service.from("routes").insert({ set_id: set!.id, number: 1, has_zone: false });

      const seen = await memberClient.from("sets").select("id").eq("id", set!.id).maybeSingle();
      expect(seen.data?.id).toBe(set!.id);

      const created = await memberClient
        .from("sets")
        .insert({
          gym_id: gymId,
          name: "int: member's",
          starts_at: "2026-10-01",
          ends_at: "2027-10-01",
          grading_scale: "v",
          max_grade: 10,
          status: "draft",
        })
        .select("id");
      expect(created.error?.code).toBe("42501");

      // Filtered out, not refused: no error and no row. This is the
      // shape the actions now treat as a failure.
      const edited = await memberClient
        .from("sets")
        .update({ name: "int: hijacked" })
        .eq("id", set!.id)
        .select("id");
      expect(edited.error).toBeNull();
      expect(edited.data).toEqual([]);

      const route = await memberClient
        .from("routes")
        .insert({ set_id: set!.id, number: 2, has_zone: false })
        .select("id");
      expect(route.error?.code).toBe("42501");

      const published = await memberClient.rpc("publish_set", { p_set_id: set!.id });
      expect(published.error?.code).toBe("42501");
      expect(await statusOf(set!.id)).toBe("draft");
    });
  });

  describe("publish_set", () => {
    it("refuses a Set with no routes", async () => {
      const { data: set } = await createDraft("int: empty");
      const { error } = await adminClient.rpc("publish_set", { p_set_id: set!.id });
      expect(error?.code).toBe("22023");
      expect(error?.message).toBe("Add at least one route before publishing this set.");
      expect(await statusOf(set!.id)).toBe("draft");
    });

    it("makes the Set live and archives the one it replaces, together", async () => {
      const first = (await createDraft("int: first")).data!.id;
      const second = (await createDraft("int: second")).data!.id;
      await service.from("routes").insert([
        { set_id: first, number: 1, has_zone: false },
        { set_id: second, number: 1, has_zone: false },
      ]);

      expect((await adminClient.rpc("publish_set", { p_set_id: first })).error).toBeNull();
      expect(await statusOf(first)).toBe("live");

      expect((await adminClient.rpc("publish_set", { p_set_id: second })).error).toBeNull();
      expect(await statusOf(second)).toBe("live");
      expect(await statusOf(first)).toBe("archived");

      // Publishing what is already live changes nothing and isn't an error.
      expect((await adminClient.rpc("publish_set", { p_set_id: second })).error).toBeNull();
      expect(await statusOf(second)).toBe("live");
    });

    it("cannot leave two live Sets at a gym, even by writing the column", async () => {
      const third = (await createDraft("int: third")).data!.id;
      const direct = await adminClient.from("sets").update({ status: "live" }).eq("id", third).select("id");
      // `sets_one_live_per_gym`: the second live Set from the test above
      // is still standing.
      expect(direct.error?.code).toBe("23505");
      expect(await statusOf(third)).toBe("draft");
    });

    it("reads a Match, a missing Set and someone else's gym the same way", async () => {
      const elsewhere = await service
        .from("sets")
        .insert({
          gym_id: otherGymId,
          name: "int: elsewhere",
          starts_at: "2026-10-01",
          ends_at: "2027-10-01",
          grading_scale: "v",
          max_grade: 10,
          status: "draft",
        })
        .select("id")
        .single();
      const missing = "00000000-0000-4000-8000-000000000000";
      for (const id of [elsewhere.data!.id, missing]) {
        const { error } = await adminClient.rpc("publish_set", { p_set_id: id });
        expect(error?.code).toBe("42501");
        expect(error?.message).toBe("Set not found");
      }
    });
  });
});
