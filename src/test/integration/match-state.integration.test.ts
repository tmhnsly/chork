/**
 * End-to-end integration tests for the Match RPC contract.
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
 * They matter more than usual right now: the Set convergence
 * (migrations 080–088) moved Matches onto the same tables as the gym
 * wall, so a policy mistake here is not confined to a Match — it is
 * reachable from `routes` and `route_logs`, which the wall also uses.
 * Several tests below assert the *negative* case for that reason.
 *
 * Every test provisions its own fixture data and cleans up in
 * `afterAll`. Failures don't leak across tests. If a test aborts
 * mid-run, the cleanup loop still runs — but any orphaned rows are
 * easy to spot (test user emails are prefixed `integration-` and
 * Match names start with `int:`).
 *
 * Run locally:
 *     pnpm test:integration
 *
 * CI: without `SUPABASE_SERVICE_ROLE_KEY`, `canRunIntegration`
 * collapses to `false` and the whole describe block is skipped rather
 * than failing.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  canRunIntegration,
  makeServiceClient,
  makeUserClient,
} from "./supabase-client";
import { createTestUser, deleteTestUser, signInAsUser } from "./fixtures";

describe.skipIf(!canRunIntegration)("Match RPCs (integration)", () => {
  const service = makeServiceClient();
  const hostClient = makeUserClient();
  const guestClient = makeUserClient();

  let hostUserId: string;
  let guestUserId: string;
  const createdSetIds: string[] = [];

  async function createMatchAsHost(name: string): Promise<string> {
    const { data, error } = await hostClient.rpc("create_match", {
      p_name: name,
      p_grading_scale: "v",
      p_min_grade: 0,
      p_max_grade: 8,
    });
    expect(error, `create_match "${name}"`).toBeNull();
    const rows = data as Array<{ id: string; code: string }> | null;
    expect(rows).toBeTruthy();
    expect(rows!.length).toBe(1);
    const setId = rows![0].id;
    createdSetIds.push(setId);
    return setId;
  }

  async function addRoute(setId: string, description: string) {
    const { data, error } = await hostClient.rpc("add_match_route", {
      p_set_id: setId,
      p_description: description,
      p_grade: 4,
      p_has_zone: true,
    });
    expect(error, `add_match_route "${description}"`).toBeNull();
    return data as { id: string; number: number };
  }

  beforeAll(async () => {
    const host = await createTestUser(service);
    hostUserId = host.userId;
    await signInAsUser(hostClient, host.email, host.password);

    const guest = await createTestUser(service);
    guestUserId = guest.userId;
    await signInAsUser(guestClient, guest.email, guest.password);
  }, 60_000);

  afterAll(async () => {
    // `sets` cascades to routes, set_players, set_grades; `routes`
    // cascades to route_logs. One delete per Match is the whole
    // cleanup — which is itself a property of the convergence worth
    // noticing, since the match version had to walk five tables.
    for (const setId of createdSetIds) {
      await service.from("sets").delete().eq("id", setId);
    }
    if (hostUserId) await deleteTestUser(service, hostUserId);
    if (guestUserId) await deleteTestUser(service, guestUserId);
  }, 60_000);

  // ── create_match ────────────────────────────────

  describe("create_match", () => {
    it("inserts a climber-owned Set and seats the host as a player", async () => {
      const setId = await createMatchAsHost("int: create v-scale");

      const { data: row, error } = await service
        .from("sets")
        .select("*")
        .eq("id", setId)
        .single();

      expect(error).toBeNull();
      expect(row!.owner_kind).toBe("climber");
      expect(row!.host_id).toBe(hostUserId);
      expect(row!.status).toBe("live");
      // A Match has no gym and no scheduled end.
      expect(row!.gym_id).toBeNull();
      expect(row!.ends_at).toBeNull();
      expect(row!.code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);

      const { data: players } = await service
        .from("set_players")
        .select("user_id, is_host, left_at")
        .eq("set_id", setId);
      expect(players).toHaveLength(1);
      expect(players![0]).toMatchObject({
        user_id: hostUserId,
        is_host: true,
        left_at: null,
      });
    }, 30_000);
  });

  // ── join ────────────────────────────────────────

  describe("lookup_match_by_code + join_match", () => {
    it("lets a stranger resolve a code and join, then read the room", async () => {
      const setId = await createMatchAsHost("int: join by code");
      const { data: setRow } = await service
        .from("sets").select("code").eq("id", setId).single();

      // Pre-join lookup runs on the joiner's OWN client — they are not
      // a player yet, so nothing membership-gated can work here.
      const { data: lookup, error: lookupErr } = await guestClient.rpc(
        "lookup_match_by_code",
        { p_code: setRow!.code! },
      );
      expect(lookupErr).toBeNull();
      const found = (lookup as Array<{ set_id: string; at_cap: boolean }>)[0];
      expect(found.set_id).toBe(setId);
      expect(found.at_cap).toBe(false);

      const { error: joinErr } = await guestClient.rpc("join_match", {
        p_set_id: setId,
      });
      expect(joinErr).toBeNull();

      const { data: state } = await service.rpc("get_match_state_for_user", {
        p_set_id: setId,
        p_user_id: guestUserId,
      });
      expect(state).toBeTruthy();
      const players = (state as { players: unknown[] }).players;
      expect(players).toHaveLength(2);
    }, 30_000);

    it("returns null state for someone who never joined", async () => {
      const setId = await createMatchAsHost("int: non-player");
      const { data: state } = await service.rpc("get_match_state_for_user", {
        p_set_id: setId,
        p_user_id: guestUserId,
      });
      expect(state).toBeNull();
    }, 30_000);
  });

  // ── routes + logs + board ───────────────────────

  describe("route + log + leaderboard flow", () => {
    it("numbers routes sequentially and scores logs through the shared ladder", async () => {
      const setId = await createMatchAsHost("int: flow");
      const first = await addRoute(setId, "int: blue crimps");
      const second = await addRoute(setId, "int: the arete");
      expect([first.number, second.number]).toEqual([1, 2]);

      // Flash with zone = 4 + 1; three-attempt send = 2. Total 7.
      const { error: e1 } = await hostClient.rpc("upsert_match_log", {
        p_route_id: first.id,
        p_attempts: 1,
        p_completed: true,
        p_zone: true,
      });
      expect(e1).toBeNull();
      const { error: e2 } = await hostClient.rpc("upsert_match_log", {
        p_route_id: second.id,
        p_attempts: 3,
        p_completed: true,
        p_zone: false,
      });
      expect(e2).toBeNull();

      // `set_id` is derived by trigger, never supplied by the caller.
      const { data: logs } = await service
        .from("route_logs")
        .select("set_id, gym_id")
        .eq("route_id", first.id);
      expect(logs![0].set_id).toBe(setId);
      expect(logs![0].gym_id).toBeNull();

      const { data: board, error: boardErr } = await hostClient.rpc(
        "get_match_leaderboard",
        { p_set_id: setId },
      );
      expect(boardErr).toBeNull();
      const me = (board as unknown as Array<Record<string, number>>)[0];
      expect(me.points).toBe(7);
      expect(me.sends).toBe(2);
      expect(me.flashes).toBe(1);
      expect(me.zones).toBe(1);
      expect(me.rank).toBe(1);
      // Own attempts pass through: 1 + 3.
      expect(me.attempts).toBe(4);
    }, 60_000);

    it("preserves completed_at when an already-sent route is re-tapped", async () => {
      // `last_send_at` is the board's fourth tiebreak, so restamping
      // it on a correction would silently reorder tied climbers.
      const setId = await createMatchAsHost("int: retap");
      const route = await addRoute(setId, "int: retap route");

      await hostClient.rpc("upsert_match_log", {
        p_route_id: route.id, p_attempts: 1, p_completed: true, p_zone: false,
      });
      const { data: before } = await service
        .from("route_logs").select("completed_at").eq("route_id", route.id).single();

      await hostClient.rpc("upsert_match_log", {
        p_route_id: route.id, p_attempts: 1, p_completed: true, p_zone: true,
      });
      const { data: after } = await service
        .from("route_logs").select("completed_at, zone").eq("route_id", route.id).single();

      expect(after!.completed_at).toBe(before!.completed_at);
      expect(after!.zone).toBe(true);
    }, 60_000);
  });

  // ── the convergence's sharp edge ────────────────

  describe("Match writes cannot reach the gym wall", () => {
    it("refuses to move a route into a Set the editor isn't in", async () => {
      // `set_routes_update_by_player` gained its `with check` in
      // migration 087. Without it a player could repoint `set_id` at
      // a Set they have no part in — a gym's, and onto that gym's
      // wall. The target here is the GUEST's Match, which the host is
      // not a player of; moving between two of your own Matches is
      // permitted, and an earlier version of this test proved only
      // that, which is why it says "isn't in" rather than "another".
      const mine = await createMatchAsHost("int: mine");
      const route = await addRoute(mine, "int: movable?");

      const { data: theirs } = await guestClient.rpc("create_match", {
        p_name: "int: theirs",
        p_grading_scale: "points",
      });
      const theirSetId = (theirs as Array<{ id: string }>)[0].id;
      createdSetIds.push(theirSetId);

      const { data, error } = await hostClient
        .from("routes")
        .update({ set_id: theirSetId })
        .eq("id", route.id)
        .select("id");

      // Either the check rejects it outright or it matches no rows —
      // both are "didn't happen". What must NOT happen is a move.
      if (!error) expect(data ?? []).toHaveLength(0);

      const { data: check } = await service
        .from("routes").select("set_id").eq("id", route.id).single();
      expect(check!.set_id).toBe(mine);
    }, 60_000);

    it("refuses a Match log that claims a gym", async () => {
      const setId = await createMatchAsHost("int: no gym claim");
      const route = await addRoute(setId, "int: gymless");

      const { error } = await hostClient.from("route_logs").insert({
        user_id: hostUserId,
        route_id: route.id,
        // A real gym id would be worse; any non-null value must fail
        // the `gym_id is null` clause of the Match branch.
        gym_id: "00000000-0000-0000-0000-000000000001",
        attempts: 1,
        completed: true,
        zone: false,
      } as never);
      expect(error).toBeTruthy();
    }, 30_000);
  });

  // ── discipline ──────────────────────────────────

  describe("discipline", () => {
    it("inherits by default, stores only a genuine override", async () => {
      const { data: created } = await hostClient.rpc("create_match", {
        p_name: "int: rope match",
        p_grading_scale: "french",
        p_min_grade: 0,
        p_max_grade: 15,
        p_discipline: "sport",
      });
      const setId = (created as Array<{ id: string }>)[0].id;
      createdSetIds.push(setId);

      const { data: setRow } = await service
        .from("sets").select("discipline, grading_scale").eq("id", setId).single();
      expect(setRow!.discipline).toBe("sport");
      expect(setRow!.grading_scale).toBe("french");

      // Says nothing → inherits.
      const { data: silent } = await hostClient.rpc("add_match_route", {
        p_set_id: setId, p_description: "int: silent", p_has_zone: false,
      });
      expect((silent as { discipline: string | null }).discipline).toBeNull();

      // Agrees with the Match → still inherits, so changing the
      // Match's discipline later still moves it.
      const { data: agrees } = await hostClient.rpc("add_match_route", {
        p_set_id: setId, p_description: "int: agrees", p_has_zone: false,
        p_discipline: "sport",
      });
      expect((agrees as { discipline: string | null }).discipline).toBeNull();

      // Genuinely differs → stored. The outdoor mixed-session case.
      const { data: differs } = await hostClient.rpc("add_match_route", {
        p_set_id: setId, p_description: "int: differs", p_has_zone: false,
        p_discipline: "boulder",
      });
      const differsId = (differs as { id: string; discipline: string | null }).id;
      expect((differs as { discipline: string | null }).discipline).toBe("boulder");

      // Editing it back to the Match's own must re-normalise to null —
      // the edit path is a direct UPDATE, not an RPC, so this is the
      // trigger from migration 093 doing the work.
      const { error: editErr } = await hostClient
        .from("routes").update({ discipline: "sport" }).eq("id", differsId);
      expect(editErr).toBeNull();
      const { data: after } = await service
        .from("routes").select("discipline").eq("id", differsId).single();
      expect(after!.discipline).toBeNull();
    }, 60_000);

    it("refuses a discipline that isn't one", async () => {
      const { error } = await hostClient.rpc("create_match", {
        p_grading_scale: "v",
        p_discipline: "trad",
      });
      expect(error).toBeTruthy();
    }, 30_000);
  });

  // ── guests ──────────────────────────────────────

  describe("guest players", () => {
    it("scores a guest with no account, entered by the host", async () => {
      const setId = await createMatchAsHost("int: guests");
      const route = await addRoute(setId, "int: guest route");

      // A guest is a named seat — no auth user, no profile.
      const { data: seat, error: seatErr } = await hostClient
        .from("set_players")
        .insert({ set_id: setId, user_id: null, display_name: "Dave" })
        .select("id")
        .single();
      expect(seatErr).toBeNull();
      const playerId = (seat as { id: string }).id;

      // Host enters their send: flash with the zone.
      const { error: logErr } = await hostClient.rpc("upsert_match_log", {
        p_route_id: route.id,
        p_attempts: 1,
        p_completed: true,
        p_zone: true,
        p_player_id: playerId,
      });
      expect(logErr).toBeNull();

      const { data: log } = await service
        .from("route_logs").select("user_id, player_id, gym_id")
        .eq("player_id", playerId).single();
      expect(log!.user_id).toBeNull();
      expect(log!.gym_id).toBeNull();

      const { data: board } = await hostClient.rpc("get_match_leaderboard", {
        p_set_id: setId,
      });
      const rows = board as Array<Record<string, unknown>>;
      const guest = rows.find((r) => r.is_guest);
      expect(guest).toBeTruthy();
      expect(guest!.display_name).toBe("Dave");
      expect(guest!.user_id).toBeNull();
      expect(guest!.points).toBe(5); // flash 4 + zone 1
      // A guest has no account to own attempts, so they never leave
      // the database — the host reads them from `guest_logs`.
      expect(guest!.attempts).toBe(0);

      const { data: state } = await service.rpc("get_match_state_for_user", {
        p_set_id: setId,
        p_user_id: hostUserId,
      });
      expect((state as { guest_logs: unknown[] }).guest_logs).toHaveLength(1);
    }, 60_000);

    it("never lets a non-host write a guest's score", async () => {
      const setId = await createMatchAsHost("int: guest guard");
      const route = await addRoute(setId, "int: guarded");
      const { data: seat } = await hostClient
        .from("set_players")
        .insert({ set_id: setId, user_id: null, display_name: "Target" })
        .select("id").single();
      const playerId = (seat as { id: string }).id;

      await guestClient.rpc("join_match", { p_set_id: setId });

      // Via the RPC…
      const { error: rpcErr } = await guestClient.rpc("upsert_match_log", {
        p_route_id: route.id, p_attempts: 1, p_completed: true, p_zone: false,
        p_player_id: playerId,
      });
      expect(rpcErr).toBeTruthy();

      // …and by going straight at the table.
      const { error: rawErr } = await guestClient.from("route_logs").insert({
        player_id: playerId, route_id: route.id, gym_id: null,
        attempts: 1, completed: true, zone: false,
      } as never);
      expect(rawErr).toBeTruthy();

      const { data: logs } = await service
        .from("route_logs").select("id").eq("player_id", playerId);
      expect(logs).toHaveLength(0);
    }, 60_000);

    it("keeps guests off the gym leaderboard entirely", async () => {
      // The gym board is for signed-in gym members. A guest's log has
      // no gym_id and belongs to a climber-owned Set, so it cannot
      // reach `user_set_stats` — the cache behind that board.
      const setId = await createMatchAsHost("int: no gym leak");
      const route = await addRoute(setId, "int: leaky?");
      const { data: seat } = await hostClient
        .from("set_players")
        .insert({ set_id: setId, user_id: null, display_name: "Ghost" })
        .select("id").single();
      const playerId = (seat as { id: string }).id;

      await hostClient.rpc("upsert_match_log", {
        p_route_id: route.id, p_attempts: 1, p_completed: true, p_zone: false,
        p_player_id: playerId,
      });

      const { data: stats } = await service
        .from("user_set_stats").select("user_id").eq("set_id", setId);
      // Only the host could have a row, and they logged nothing here.
      expect(stats ?? []).toHaveLength(0);
    }, 60_000);
  });

  // ── end ─────────────────────────────────────────

  describe("end_match", () => {
    it("archives in place and keeps every row readable", async () => {
      const setId = await createMatchAsHost("int: end");
      const route = await addRoute(setId, "int: ended route");
      await hostClient.rpc("upsert_match_log", {
        p_route_id: route.id, p_attempts: 1, p_completed: true, p_zone: false,
      });

      const { error } = await hostClient.rpc("end_match", { p_set_id: setId });
      expect(error).toBeNull();

      const { data: row } = await service
        .from("sets").select("status, ends_at").eq("id", setId).single();
      expect(row!.status).toBe("archived");
      expect(row!.ends_at).toBeTruthy();

      // The whole point: nothing was collapsed or deleted, so the
      // result reads the same rows the live board read.
      const { data: logs } = await service
        .from("route_logs").select("id").eq("set_id", setId);
      expect(logs).toHaveLength(1);

      const { data: state } = await service.rpc("get_match_state_for_user", {
        p_set_id: setId,
        p_user_id: hostUserId,
      });
      expect((state as { routes: unknown[] }).routes).toHaveLength(1);

      // And it shows up in history, ranked by the same clause.
      const { data: history } = await service.rpc("get_match_history", {
        p_user_id: hostUserId,
      });
      const entry = (history as Array<{ set_id: string; user_rank: number; user_is_winner: boolean }>)
        .find((h) => h.set_id === setId);
      expect(entry).toBeTruthy();
      expect(entry!.user_rank).toBe(1);
      expect(entry!.user_is_winner).toBe(true);
    }, 60_000);

    it("refuses to log into a Match that has ended", async () => {
      const setId = await createMatchAsHost("int: ended write");
      const route = await addRoute(setId, "int: too late");
      await hostClient.rpc("end_match", { p_set_id: setId });

      const { error } = await hostClient.rpc("upsert_match_log", {
        p_route_id: route.id, p_attempts: 1, p_completed: true, p_zone: false,
      });
      expect(error).toBeTruthy();
    }, 60_000);
  });

  // ── sharing ─────────────────────────────────────

  describe("public result", () => {
    it("resolves by token and never carries attempts", async () => {
      const setId = await createMatchAsHost("int: shared");
      const route = await addRoute(setId, "int: shared route");
      await hostClient.rpc("upsert_match_log", {
        p_route_id: route.id, p_attempts: 7, p_completed: true, p_zone: false,
      });
      await hostClient.rpc("end_match", { p_set_id: setId });

      const token = "int" + "0".repeat(29);
      await service.from("sets").update({ share_token: token }).eq("id", setId);

      const { data, error } = await service.rpc("get_public_match_result", {
        p_token: token,
      });
      expect(error).toBeNull();
      expect(data).toBeTruthy();

      const payload = data as unknown as {
        players: Array<Record<string, unknown>>;
      };
      expect(payload.players).toHaveLength(1);
      // Assert on the KEYS rather than grepping the JSON: ids,
      // timestamps and generated usernames contain every digit, so a
      // string search for the count is noise, not a privacy check.
      expect(Object.keys(payload.players[0]).sort()).toEqual([
        "display_name",
        "flashes",
        "is_guest",
        "is_winner",
        "points",
        "points_tenths",
        "rank",
        "sends",
        "username",
        "zones",
      ]);
    }, 60_000);

    it("returns null for a token that resolves to nothing", async () => {
      const { data } = await service.rpc("get_public_match_result", {
        p_token: "n" + "0".repeat(29),
      });
      expect(data).toBeNull();
    }, 30_000);
  });
});
