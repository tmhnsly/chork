/**
 * Climbers can't delete route logs (migration 140), against the real
 * database.
 *
 * Found mapping game deletion (2026-09-15): once a game had ended, a
 * player's edit to their own log was refused, but deleting it went
 * through, so a finished result, a league week's placings or an archived
 * gym board could be rewritten through the Data API. Nothing in the app
 * deletes a log directly; a log goes with its route, set or account.
 *
 * Fixtures follow match-state.integration.test.ts: `integration-` users,
 * `int:` names, and one delete per Set in `afterAll`.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { canRunIntegration, makeServiceClient, makeUserClient } from "./supabase-client";
import { createTestUser, deleteTestUser, signInAsUser } from "./fixtures";

describe.skipIf(!canRunIntegration)("route log deletes (integration)", () => {
  const service = makeServiceClient();
  const hostClient = makeUserClient();
  const playerClient = makeUserClient();
  let hostUserId: string;
  let playerUserId: string;
  const createdSetIds = new Set<string>();

  /** A live game with the player seated and one of their sends logged. */
  async function gameWithAPlayerSend(name: string): Promise<{ setId: string; routeId: string }> {
    // create_match hands a host their empty live game back (137), so end
    // the last one first, the way a host would before starting another.
    const { data: live } = await service
      .from("sets")
      .select("id")
      .eq("host_id", hostUserId)
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

    const { data: route, error: routeError } = await hostClient.rpc("add_match_route", {
      p_set_id: setId,
      p_description: `${name} route`,
      p_grade: 4,
      p_has_zone: false,
    });
    expect(routeError, "add_match_route").toBeNull();
    const routeId = (route as { id: string }).id;

    const { error: logError } = await playerClient.rpc("upsert_match_log", {
      p_route_id: routeId,
      p_attempts: 3,
      p_completed: true,
      p_zone: false,
    });
    expect(logError, "upsert_match_log").toBeNull();
    return { setId, routeId };
  }

  async function playerLogCount(routeId: string): Promise<number> {
    const { count, error } = await service
      .from("route_logs")
      .select("id", { count: "exact", head: true })
      .eq("route_id", routeId)
      .eq("user_id", playerUserId);
    expect(error).toBeNull();
    return count ?? 0;
  }

  /** The player deleting their own log on this route through the Data API. */
  function playerDeletesOwnLog(routeId: string) {
    return playerClient
      .from("route_logs")
      .delete()
      .eq("route_id", routeId)
      .eq("user_id", playerUserId)
      .select("id");
  }

  beforeAll(async () => {
    const host = await createTestUser(service);
    hostUserId = host.userId;
    await signInAsUser(hostClient, host.email, host.password);

    const player = await createTestUser(service);
    playerUserId = player.userId;
    await signInAsUser(playerClient, player.email, player.password);
  }, 60_000);

  afterAll(async () => {
    // `sets` cascades to routes, and `routes` to route_logs.
    for (const setId of createdSetIds) {
      await service.from("sets").delete().eq("id", setId);
    }
    if (hostUserId) await deleteTestUser(service, hostUserId);
    if (playerUserId) await deleteTestUser(service, playerUserId);
  }, 60_000);

  it("a player can't delete their own log while the game is live", async () => {
    const { routeId } = await gameWithAPlayerSend("int: log delete while live");

    const { data, error } = await playerDeletesOwnLog(routeId);

    // Refused at the privilege check, and nothing comes back deleted.
    expect(error?.code).toBe("42501");
    expect(data ?? []).toHaveLength(0);
    expect(await playerLogCount(routeId)).toBe(1);
  });

  it("a player can't delete their own log after the game ends", async () => {
    const { setId, routeId } = await gameWithAPlayerSend("int: log delete after the end");
    const { error: endError } = await hostClient.rpc("end_match", { p_set_id: setId });
    expect(endError, "end_match").toBeNull();

    const { data, error } = await playerDeletesOwnLog(routeId);

    expect(error?.code).toBe("42501");
    expect(data ?? []).toHaveLength(0);
    expect(await playerLogCount(routeId)).toBe(1);
  });

  it("a log still goes when its game is deleted", async () => {
    const { setId, routeId } = await gameWithAPlayerSend("int: log goes with its game");

    const { error } = await service.from("sets").delete().eq("id", setId);

    expect(error).toBeNull();
    createdSetIds.delete(setId);
    expect(await playerLogCount(routeId)).toBe(0);
  });
});
