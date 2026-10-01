/**
 * The game type locks with the first route (migration 146), against the
 * real database.
 *
 * Found in a live game: route 1 up, and the host turned Points into
 * Chork from the setup pill, because `set_match_game_mode` checked only
 * that the caller hosts a live Match. The screen now locks the pill
 * (`setupLockReason`); this pins the server's half, which is the one
 * that holds for any client.
 *
 * Fixtures follow empty-lobbies.integration.test.ts: an `integration-`
 * user, `int:` names, and one delete per Set in `afterAll`.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { canRunIntegration, makeServiceClient, makeUserClient } from "./supabase-client";
import { createTestUser, deleteTestUser, signInAsUser } from "./fixtures";

describe.skipIf(!canRunIntegration)("game type lock (integration)", () => {
  const service = makeServiceClient();
  const host = makeUserClient();
  let hostUserId: string;
  const createdSetIds = new Set<string>();

  async function startGame(): Promise<string> {
    const { data, error } = await host.rpc("create_match", {
      p_name: "int: game type lock",
      p_grading_scale: "v",
      p_min_grade: 0,
      p_max_grade: 8,
    });
    expect(error, "create_match").toBeNull();
    const rows = data as Array<{ id: string }> | null;
    expect(rows).toHaveLength(1);
    createdSetIds.add(rows![0].id);
    return rows![0].id;
  }

  async function gameModeOf(setId: string): Promise<string | null> {
    const { data, error } = await service.from("sets").select("game_mode").eq("id", setId).single();
    expect(error).toBeNull();
    return data?.game_mode ?? null;
  }

  beforeAll(async () => {
    const user = await createTestUser(service);
    hostUserId = user.userId;
    await signInAsUser(host, user.email, user.password);
  }, 60_000);

  afterAll(async () => {
    // `sets` cascades to routes, set_players, set_grades and logs.
    for (const setId of createdSetIds) {
      await service.from("sets").delete().eq("id", setId);
    }
    if (hostUserId) await deleteTestUser(service, hostUserId);
  }, 60_000);

  it("the host can switch the game type freely before the first route", async () => {
    const setId = await startGame();
    expect((await host.rpc("set_match_game_mode", { p_set_id: setId, p_mode: "chork" })).error).toBeNull();
    expect(await gameModeOf(setId)).toBe("chork");
    expect((await host.rpc("set_match_game_mode", { p_set_id: setId, p_mode: "points" })).error).toBeNull();
    expect(await gameModeOf(setId)).toBe("points");
  });

  it("refuses once a route is up, in either direction, and changes nothing", async () => {
    const setId = await startGame();
    const route = await host.rpc("add_match_route", {
      p_set_id: setId,
      p_grade: 2,
      p_has_zone: false,
    });
    expect(route.error, "add_match_route").toBeNull();

    const toChork = await host.rpc("set_match_game_mode", { p_set_id: setId, p_mode: "chork" });
    expect(toChork.error?.code).toBe("22023");
    expect(await gameModeOf(setId)).toBe("points");
  });

  it("still refuses a non-host first, without saying whether routes are up", async () => {
    const setId = await startGame();
    const stranger = makeUserClient();
    const other = await createTestUser(service);
    try {
      await signInAsUser(stranger, other.email, other.password);
      const { error } = await stranger.rpc("set_match_game_mode", { p_set_id: setId, p_mode: "chork" });
      expect(error?.code).toBe("42501");
      expect(await gameModeOf(setId)).toBe("points");
    } finally {
      await deleteTestUser(service, other.userId);
    }
  }, 60_000);
});
