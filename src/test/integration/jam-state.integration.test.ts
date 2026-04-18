/**
 * End-to-end integration tests for the jam RPC contract.
 *
 * These tests hit the real Supabase instance configured via
 * `.env.local` (see `supabase-client.ts`). They exist specifically
 * to catch the class of bug that mocked unit tests can't:
 *   • SQL that compiles locally but errors at runtime
 *     (`row_to_jsonb(record) does not exist`, missing grants,
 *     search-path resolution failures, jsonb shape mismatches)
 *   • RLS policies that say "yes" in the planner but "no" at
 *     execution time under specific role contexts
 *   • Type drift between `database.types.ts` and the live schema
 *     after a migration is forgotten or partially applied
 *
 * Every test provisions its own fixture data and cleans up in
 * `afterAll`. Failures don't leak across tests. If a test aborts
 * mid-run, the cleanup loop still runs — but any orphaned rows
 * are easy to spot (test user emails are prefixed
 * `integration-` and jam names start with `int:`).
 *
 * Run locally:
 *     pnpm test:integration
 *
 * CI: set `SUPABASE_SERVICE_ROLE_KEY` to skip (`canRunIntegration`
 * collapses to `false` without it, and the whole describe block
 * is skipped rather than failing.)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  canRunIntegration,
  makeServiceClient,
  makeUserClient,
} from "./supabase-client";
import {
  cleanupJam,
  createTestUser,
  deleteTestUser,
  signInAsUser,
} from "./fixtures";

describe.skipIf(!canRunIntegration)("jam RPCs (integration)", () => {
  const service = makeServiceClient();
  const hostClient = makeUserClient();

  let hostUserId: string;
  const createdJamIds: string[] = [];

  async function createJamAsHost(name: string): Promise<string> {
    const { data, error } = await hostClient.rpc("create_jam", {
      p_name: name,
      p_grading_scale: "v",
      p_min_grade: 0,
      p_max_grade: 8,
    });
    expect(error, `create_jam "${name}"`).toBeNull();
    const rows = data as Array<{ id: string; code: string }> | null;
    expect(rows).toBeTruthy();
    expect(rows!.length).toBe(1);
    const jamId = rows![0].id;
    createdJamIds.push(jamId);
    return jamId;
  }

  beforeAll(async () => {
    const user = await createTestUser(service);
    hostUserId = user.userId;
    await signInAsUser(hostClient, user.email, user.password);
  }, 30_000);

  afterAll(async () => {
    for (const jamId of createdJamIds) {
      await cleanupJam(service, jamId, { alsoDropSummary: true });
    }
    if (hostUserId) await deleteTestUser(service, hostUserId);
  }, 30_000);

  // ── create_jam ──────────────────────────────────

  describe("create_jam", () => {
    it("inserts a jam row and seeds the host as a player", async () => {
      const jamId = await createJamAsHost("int: create v-scale");

      const { data: jam, error: jamErr } = await service
        .from("jams")
        .select("*")
        .eq("id", jamId)
        .single();
      expect(jamErr).toBeNull();
      expect(jam).toBeTruthy();
      expect(jam!.host_id).toBe(hostUserId);
      expect(jam!.status).toBe("live");
      expect(jam!.grading_scale).toBe("v");

      const { data: player } = await service
        .from("jam_players")
        .select("user_id, left_at")
        .eq("jam_id", jamId)
        .eq("user_id", hostUserId)
        .maybeSingle();
      expect(player).toBeTruthy();
      expect(player!.left_at).toBeNull();
    });

    it("accepts the points-only grading scale", async () => {
      const { data, error } = await hostClient.rpc("create_jam", {
        p_name: "int: points only",
        p_grading_scale: "points",
      });
      expect(error, "create_jam(points)").toBeNull();
      const rows = data as Array<{ id: string }>;
      expect(rows.length).toBe(1);
      createdJamIds.push(rows[0].id);

      const { data: jam } = await service
        .from("jams")
        .select("grading_scale, min_grade, max_grade")
        .eq("id", rows[0].id)
        .single();
      expect(jam!.grading_scale).toBe("points");
      expect(jam!.min_grade).toBeNull();
      expect(jam!.max_grade).toBeNull();
    });
  });

  // ── get_jam_state_for_user (the regression test) ─

  describe("get_jam_state_for_user", () => {
    it("returns the full payload for an active player", async () => {
      const jamId = await createJamAsHost("int: state for host");

      const { data, error } = await service.rpc("get_jam_state_for_user", {
        p_jam_id: jamId,
        p_user_id: hostUserId,
      });

      // The bug that shipped in migration 048 raised
      // `function row_to_jsonb(record) does not exist`. This
      // assertion is the minimum bar — if the RPC can't even
      // return a payload, the rest of the app can't resume a jam.
      expect(error, "get_jam_state_for_user").toBeNull();
      expect(data).toBeTruthy();

      // Shape check — every top-level key the client reads.
      const state = data as Record<string, unknown>;
      expect(state).toHaveProperty("jam");
      expect(state).toHaveProperty("grades");
      expect(state).toHaveProperty("routes");
      expect(state).toHaveProperty("players");
      expect(state).toHaveProperty("my_logs");
      expect(state).toHaveProperty("leaderboard");

      // Leaderboard is an array (jsonb_agg falls back to '[]'::jsonb
      // when there are no rows). If the record-type resolution
      // fails, it'll error out well before this.
      expect(Array.isArray(state.leaderboard)).toBe(true);
      expect(Array.isArray(state.players)).toBe(true);
      expect(Array.isArray(state.routes)).toBe(true);
      expect(Array.isArray(state.my_logs)).toBe(true);
    });

    it("returns null for a user who isn't a player", async () => {
      const jamId = await createJamAsHost("int: state for stranger");

      const { data, error } = await service.rpc("get_jam_state_for_user", {
        p_jam_id: jamId,
        p_user_id: "00000000-0000-0000-0000-000000000000",
      });
      expect(error).toBeNull();
      expect(data).toBeNull();
    });

    it("returns null for a jam id that doesn't exist", async () => {
      const { data, error } = await service.rpc("get_jam_state_for_user", {
        p_jam_id: "11111111-1111-1111-1111-111111111111",
        p_user_id: hostUserId,
      });
      expect(error).toBeNull();
      expect(data).toBeNull();
    });
  });

  // ── get_active_jam_for_user_by_id ────────────────

  describe("get_active_jam_for_user_by_id", () => {
    it("returns the most recent live jam the user is in", async () => {
      const jamId = await createJamAsHost("int: active for host");

      const { data, error } = await service.rpc(
        "get_active_jam_for_user_by_id",
        { p_user_id: hostUserId },
      );
      expect(error).toBeNull();
      const rows = data as Array<{ jam_id: string }> | null;
      expect(rows).toBeTruthy();
      expect(rows!.length).toBeGreaterThan(0);
      // The jam we just created is now the most recent — it should
      // be at the top of the ordered list returned by the RPC.
      expect(rows![0].jam_id).toBe(jamId);
    });
  });

  // ── add_jam_route + upsert_jam_log + leaderboard ─

  describe("route + log + leaderboard flow", () => {
    it("route inserts, log upserts, leaderboard reflects it", async () => {
      const jamId = await createJamAsHost("int: leaderboard flow");

      // Add a route (authed caller = host, who is a player).
      const { data: routeRes, error: routeErr } = await hostClient.rpc(
        "add_jam_route",
        {
          p_jam_id: jamId,
          p_description: "int test route",
          p_grade: 3,
          p_has_zone: true,
        },
      );
      expect(routeErr).toBeNull();
      expect(routeRes).toBeTruthy();
      const routeId = (routeRes as { id: string }).id;

      // Log a flash with the zone. Under our scoring, that's
      // 4 (flash) + 1 (zone) = 5 points for this one route.
      const { error: logErr } = await hostClient.rpc("upsert_jam_log", {
        p_jam_route_id: routeId,
        p_attempts: 1,
        p_completed: true,
        p_zone: true,
      });
      expect(logErr).toBeNull();

      // Leaderboard through the service-role RPC (the new code
      // path used by the page).
      const { data: state, error: stateErr } = await service.rpc(
        "get_jam_state_for_user",
        { p_jam_id: jamId, p_user_id: hostUserId },
      );
      expect(stateErr).toBeNull();
      const lb = (state as { leaderboard: Array<Record<string, number>> })
        .leaderboard;
      expect(lb.length).toBe(1);
      expect(lb[0].points).toBe(5);
      expect(lb[0].flashes).toBe(1);
      expect(lb[0].sends).toBe(1);
      expect(lb[0].zones).toBe(1);
      expect(lb[0].rank).toBe(1);
    });
  });

  // ── end_jam_as_player + get_jam_summary ──────────

  describe("end + summary", () => {
    it("ends a jam and a summary is readable for the host", async () => {
      const jamId = await createJamAsHost("int: end flow");

      // Add one route + log so the summary has something to aggregate.
      const { data: routeRes } = await hostClient.rpc("add_jam_route", {
        p_jam_id: jamId,
        p_description: null,
        p_grade: 0,
        p_has_zone: false,
      });
      const routeId = (routeRes as { id: string }).id;
      await hostClient.rpc("upsert_jam_log", {
        p_jam_route_id: routeId,
        p_attempts: 1,
        p_completed: true,
        p_zone: false,
      });

      const { data: summaryId, error: endErr } = await hostClient.rpc(
        "end_jam_as_player",
        { p_jam_id: jamId },
      );
      expect(endErr).toBeNull();
      expect(typeof summaryId).toBe("string");

      // The live rows should be gone.
      const { data: liveJam } = await service
        .from("jams")
        .select("id")
        .eq("id", jamId)
        .maybeSingle();
      expect(liveJam).toBeNull();

      // The summary should be queryable.
      const { data: summary, error: summaryErr } = await service
        .from("jam_summaries")
        .select("*")
        .eq("id", summaryId as string)
        .single();
      expect(summaryErr).toBeNull();
      expect(summary).toBeTruthy();
      expect(summary!.jam_id).toBe(jamId);
      expect(summary!.winner_user_id).toBe(hostUserId);
    });
  });
});
