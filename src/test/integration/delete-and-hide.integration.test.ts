/**
 * Deleting and hiding games (migration 141), against the real database.
 *
 * Spec: docs/superpowers/specs/2026-09-15-delete-and-hide-games-design.md.
 * The host deletes a game for everyone; any player takes a finished game
 * off their own lists, privately, and can put it back.
 *
 * Fixtures follow match-state.integration.test.ts: `integration-` users,
 * `int:` names, and one delete per Set in `afterAll`.
 */

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { canRunIntegration, makeServiceClient, makeUserClient } from "./supabase-client";
import { createTestUser, deleteTestUser, signInAsUser } from "./fixtures";

const BADGE = "int-delete-keeps-badges";

describe.skipIf(!canRunIntegration)("deleting and hiding games (integration)", () => {
  const service = makeServiceClient();
  const hostClient = makeUserClient();
  const playerClient = makeUserClient();
  const strangerClient = makeUserClient();
  let hostId: string;
  let playerId: string;
  let strangerId: string;
  const createdSetIds = new Set<string>();
  const createdLeagueIds = new Set<string>();

  /** A game with the player seated: a route and their send unless `withRoute: false`, finished if `end`. */
  async function game(name: string, opts: { withRoute?: boolean; end?: boolean } = {}): Promise<string> {
    const { withRoute = true, end = false } = opts;
    // create_match hands the host their empty live game back (137), so
    // end the last one first, the way a host would.
    const { data: live } = await service
      .from("sets")
      .select("id")
      .eq("host_id", hostId)
      .eq("status", "live");
    for (const { id } of live ?? []) {
      await service
        .from("sets")
        .update({ status: "archived", ends_at: new Date().toISOString() })
        .eq("id", id);
    }

    const { data, error } = await hostClient.rpc("create_match", {
      p_name: name,
      p_grading_scale: "v",
      p_min_grade: 0,
      p_max_grade: 8,
    });
    expect(error, "create_match").toBeNull();
    const setId = (data as Array<{ id: string }>)[0].id;
    createdSetIds.add(setId);

    const { error: joinError } = await playerClient.rpc("join_match", { p_set_id: setId });
    expect(joinError, "join_match").toBeNull();

    if (withRoute) {
      const { data: route, error: routeError } = await hostClient.rpc("add_match_route", {
        p_set_id: setId,
        p_description: `${name} route`,
        p_grade: 4,
        p_has_zone: false,
      });
      expect(routeError, "add_match_route").toBeNull();
      const { error: logError } = await playerClient.rpc("upsert_match_log", {
        p_route_id: (route as { id: string }).id,
        p_attempts: 2,
        p_completed: true,
        p_zone: false,
      });
      expect(logError, "upsert_match_log").toBeNull();
    }

    if (end) {
      const { error: endError } = await hostClient.rpc("end_match", { p_set_id: setId });
      expect(endError, "end_match").toBeNull();
    }
    return setId;
  }

  async function count(query: PromiseLike<{ count: number | null; error: unknown }>): Promise<number> {
    const { count: n, error } = await query;
    expect(error).toBeNull();
    return n ?? 0;
  }

  const setRows = (setId: string) =>
    count(service.from("sets").select("id", { count: "exact", head: true }).eq("id", setId));
  const seatRows = (setId: string) =>
    count(service.from("set_players").select("id", { count: "exact", head: true }).eq("set_id", setId));
  const routeRows = (setId: string) =>
    count(service.from("routes").select("id", { count: "exact", head: true }).eq("set_id", setId));
  const logRows = (setId: string) =>
    count(service.from("route_logs").select("id", { count: "exact", head: true }).eq("set_id", setId));

  async function historyIds(userId: string): Promise<string[]> {
    const { data, error } = await service.rpc("get_match_history", { p_user_id: userId, p_limit: 100 });
    expect(error).toBeNull();
    return ((data ?? []) as Array<{ set_id: string }>).map((row) => row.set_id);
  }

  async function gamesPlayed(userId: string): Promise<number> {
    const { data, error } = await service.rpc("get_match_achievement_context", { p_user_id: userId });
    expect(error).toBeNull();
    return Number((data as Array<{ matches_played: number }> | null)?.[0]?.matches_played ?? 0);
  }

  async function viewerHidden(setId: string, userId: string): Promise<boolean> {
    const { data, error } = await service.rpc("get_match_state_for_user", {
      p_set_id: setId,
      p_user_id: userId,
    });
    expect(error).toBeNull();
    return (data as { viewer_hidden?: boolean } | null)?.viewer_hidden === true;
  }

  beforeAll(async () => {
    const host = await createTestUser(service);
    hostId = host.userId;
    await signInAsUser(hostClient, host.email, host.password);

    const player = await createTestUser(service);
    playerId = player.userId;
    await signInAsUser(playerClient, player.email, player.password);

    const stranger = await createTestUser(service);
    strangerId = stranger.userId;
    await signInAsUser(strangerClient, stranger.email, stranger.password);
  }, 60_000);

  afterAll(async () => {
    for (const setId of createdSetIds) {
      await service.from("sets").delete().eq("id", setId);
    }
    for (const leagueId of createdLeagueIds) {
      await service.from("leagues").delete().eq("id", leagueId);
    }
    if (playerId) {
      await service.from("user_achievements").delete().eq("user_id", playerId).eq("badge_id", BADGE);
    }
    for (const id of [hostId, playerId, strangerId]) {
      if (id) await deleteTestUser(service, id);
    }
  }, 60_000);

  describe("delete_match", () => {
    it("takes a live game's seats, routes, logs and invites with it, and leaves badges", async () => {
      const setId = await game("int: delete a live game");
      const { error: inviteError } = await service.from("notifications").insert({
        user_id: strangerId,
        kind: "match_invite_received",
        payload: { set_id: setId },
      });
      expect(inviteError).toBeNull();
      const { error: badgeError } = await service
        .from("user_achievements")
        .insert({ user_id: playerId, badge_id: BADGE });
      expect(badgeError).toBeNull();

      const { data, error } = await hostClient.rpc("delete_match", { p_set_id: setId });

      expect(error).toBeNull();
      expect(data).toBe(setId);
      createdSetIds.delete(setId);
      expect(await setRows(setId)).toBe(0);
      expect(await seatRows(setId)).toBe(0);
      expect(await routeRows(setId)).toBe(0);
      expect(await logRows(setId)).toBe(0);
      expect(
        await count(
          service
            .from("notifications")
            .select("id", { count: "exact", head: true })
            .eq("kind", "match_invite_received")
            .eq("payload->>set_id", setId),
        ),
      ).toBe(0);
      expect(
        await count(
          service
            .from("user_achievements")
            .select("id", { count: "exact", head: true })
            .eq("user_id", playerId)
            .eq("badge_id", BADGE),
        ),
      ).toBe(1);
    });

    it("deletes a finished game", async () => {
      const setId = await game("int: delete a finished game", { end: true });

      const { error } = await hostClient.rpc("delete_match", { p_set_id: setId });

      expect(error).toBeNull();
      createdSetIds.delete(setId);
      expect(await setRows(setId)).toBe(0);
    });

    it("refuses a player, and nothing changes", async () => {
      const setId = await game("int: a player can't delete");

      const { error } = await playerClient.rpc("delete_match", { p_set_id: setId });

      expect(error?.code).toBe("42501");
      expect(error?.message).toBe("Only the host can delete this game");
      expect(await setRows(setId)).toBe(1);
      expect(await logRows(setId)).toBe(1);
    });

    it("answers a stranger exactly as it answers a missing game", async () => {
      const setId = await game("int: a stranger can't delete");

      const refused = await strangerClient.rpc("delete_match", { p_set_id: setId });
      const missing = await strangerClient.rpc("delete_match", { p_set_id: randomUUID() });

      expect(refused.error?.code).toBe("P0002");
      expect(refused.error?.message).toBe("Game not found");
      expect(missing.error?.code).toBe(refused.error?.code);
      expect(missing.error?.message).toBe(refused.error?.message);
      expect(await setRows(setId)).toBe(1);
    });

    it("refuses a league week with routes, and lets a live week with none go", async () => {
      const { data: league, error: leagueError } = await service
        .from("leagues")
        .insert({ host_id: hostId, name: "int: delete a week" })
        .select("id")
        .single();
      expect(leagueError).toBeNull();
      createdLeagueIds.add(league!.id);

      const played = await game("int: a played week");
      await service.from("sets").update({ league_id: league!.id }).eq("id", played);
      const refused = await hostClient.rpc("delete_match", { p_set_id: played });
      expect(refused.error?.code).toBe("22023");
      expect(refused.error?.message).toBe("Remove this week from its league before deleting it");
      expect(await setRows(played)).toBe(1);

      const accidental = await game("int: an accidental week", { withRoute: false });
      await service.from("sets").update({ league_id: league!.id }).eq("id", accidental);
      const { error } = await hostClient.rpc("delete_match", { p_set_id: accidental });
      expect(error).toBeNull();
      createdSetIds.delete(accidental);
      expect(await setRows(accidental)).toBe(0);
    });

    it("answers a log for one of its routes with 'Route not found' (P0002), the refusal the offline queue discards", async () => {
      const setId = await game("int: log to a deleted game's route");
      const { data: route, error: routeError } = await service
        .from("routes")
        .select("id")
        .eq("set_id", setId)
        .single();
      expect(routeError).toBeNull();

      const { error: deleteError } = await hostClient.rpc("delete_match", { p_set_id: setId });
      expect(deleteError).toBeNull();
      createdSetIds.delete(setId);

      // upsertMatchLogAction maps exactly this pair to ROUTE_GONE_ERROR.
      const { error } = await playerClient.rpc("upsert_match_log", {
        p_route_id: route!.id,
        p_attempts: 3,
        p_completed: true,
        p_zone: false,
      });
      expect(error?.code).toBe("P0002");
      expect(error?.message).toBe("Route not found");
    });

    it("takes a finished game's hides with it", async () => {
      const setId = await game("int: delete a hidden game", { end: true });
      const hideRows = () =>
        count(
          service
            .from("hidden_matches")
            .select("set_id", { count: "exact", head: true })
            .eq("set_id", setId),
        );
      const { error: hideError } = await playerClient.rpc("set_match_hidden", {
        p_set_id: setId,
        p_hidden: true,
      });
      expect(hideError).toBeNull();
      expect(await hideRows()).toBe(1);

      const { error } = await hostClient.rpc("delete_match", { p_set_id: setId });

      expect(error).toBeNull();
      createdSetIds.delete(setId);
      expect(await hideRows()).toBe(0);
    });
  });

  describe("set_match_hidden", () => {
    it("takes a finished game out of the player's own history and badge count only, and puts it back", async () => {
      const setId = await game("int: hide a finished game", { end: true });
      const playedBefore = await gamesPlayed(playerId);
      expect(await historyIds(playerId)).toContain(setId);

      const { data, error } = await playerClient.rpc("set_match_hidden", { p_set_id: setId, p_hidden: true });

      expect(error).toBeNull();
      expect(data).toBe(true);
      expect(await historyIds(playerId)).not.toContain(setId);
      expect(await gamesPlayed(playerId)).toBe(playedBefore - 1);
      expect(await viewerHidden(setId, playerId)).toBe(true);
      // Nobody else's view moves.
      expect(await historyIds(hostId)).toContain(setId);
      expect(await viewerHidden(setId, hostId)).toBe(false);

      const back = await playerClient.rpc("set_match_hidden", { p_set_id: setId, p_hidden: false });

      expect(back.error).toBeNull();
      expect(back.data).toBe(false);
      expect(await historyIds(playerId)).toContain(setId);
      expect(await gamesPlayed(playerId)).toBe(playedBefore);
    });

    it("refuses to hide a live game", async () => {
      const setId = await game("int: can't hide a live game");

      const { error } = await playerClient.rpc("set_match_hidden", { p_set_id: setId, p_hidden: true });

      expect(error?.code).toBe("22023");
      expect(error?.message).toBe("Only a finished game can be removed from your games");
    });

    it("answers a stranger as a missing game", async () => {
      const setId = await game("int: a stranger can't hide", { end: true });

      const { error } = await strangerClient.rpc("set_match_hidden", { p_set_id: setId, p_hidden: true });

      expect(error?.code).toBe("P0002");
      expect(error?.message).toBe("Game not found");
    });

    it("keeps hides out of the Data API's reach", async () => {
      const { error } = await playerClient.from("hidden_matches").select("set_id");

      expect(error?.code).toBe("42501");
    });
  });
});
