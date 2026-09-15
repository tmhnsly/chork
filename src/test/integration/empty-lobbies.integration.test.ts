/**
 * Empty lobbies (migration 137), against the real database.
 *
 * Found testing at Yonder: a host with several empty lobbies live at
 * once ended one, and the Games banner showed the next identical
 * "Tom's game", so ending looked broken. These pin the three fixes
 * that are safe to exercise with fixtures: a poster tap reuses an empty
 * lobby, a lobby with a route is a game and is never reused, and an
 * ended lobby with no routes stays out of history. The 3-hour sweep is
 * not called here: `end_stale_matches` acts on every live match, not
 * just fixtures.
 *
 * Fixtures follow match-state.integration.test.ts: an `integration-`
 * user, `int:` names, and one delete per Set in `afterAll`.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { canRunIntegration, makeServiceClient, makeUserClient } from "./supabase-client";
import { createTestUser, deleteTestUser, signInAsUser } from "./fixtures";

describe.skipIf(!canRunIntegration)("empty lobbies (integration)", () => {
  const service = makeServiceClient();
  const host = makeUserClient();
  let hostUserId: string;
  const createdSetIds = new Set<string>();

  /** What a poster tap sends: the create defaults, plus any override. */
  async function tapPoster(overrides: Record<string, unknown> = {}): Promise<string> {
    const { data, error } = await host.rpc("create_match", {
      p_name: "int: empty lobby",
      p_grading_scale: "v",
      p_min_grade: 0,
      p_max_grade: 8,
      ...overrides,
    });
    expect(error, "create_match").toBeNull();
    const rows = data as Array<{ id: string; code: string }> | null;
    expect(rows).toHaveLength(1);
    createdSetIds.add(rows![0].id);
    return rows![0].id;
  }

  async function liveSetsHosted(): Promise<number> {
    const { count, error } = await service
      .from("sets")
      .select("id", { count: "exact", head: true })
      .eq("host_id", hostUserId)
      .eq("status", "live");
    expect(error).toBeNull();
    return count ?? 0;
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

  it("a second poster tap reopens the empty lobby with the new setup", async () => {
    const first = await tapPoster();
    const { data: before } = await service
      .from("sets")
      .select("last_activity_at")
      .eq("id", first)
      .single();

    const second = await tapPoster({ p_name: "int: renamed by the tap", p_grading_scale: "font", p_max_grade: 10 });
    expect(second).toBe(first);
    expect(await liveSetsHosted()).toBe(1);

    const { data: row } = await service
      .from("sets")
      .select("name, grading_scale, max_grade, status, last_activity_at")
      .eq("id", first)
      .single();
    expect(row).toMatchObject({
      // The lobby keeps its own name: a poster's default never
      // overwrites one the host already has.
      name: "int: empty lobby",
      grading_scale: "font",
      max_grade: 10,
      status: "live",
    });
    // The idle clock restarts, so the sweep can't end a lobby that was
    // just opened again.
    expect(new Date(row!.last_activity_at!).getTime()).toBeGreaterThan(
      new Date(before!.last_activity_at!).getTime(),
    );
  }, 30_000);

  it("a lobby with a route is a game, and is not reused", async () => {
    const lobby = await tapPoster();
    const { error } = await host.rpc("add_match_route", {
      p_set_id: lobby,
      p_description: "int: first route",
      p_grade: 4,
      p_has_zone: false,
    });
    expect(error, "add_match_route").toBeNull();

    const next = await tapPoster();
    expect(next).not.toBe(lobby);
  }, 30_000);

  it("history leaves out a game that ended with no routes", async () => {
    const empty = await tapPoster();
    const { data: routes } = await service.from("routes").select("id").eq("set_id", empty);
    expect(routes, "the reused lobby is still empty").toHaveLength(0);
    expect((await host.rpc("end_match", { p_set_id: empty })).error).toBeNull();

    const played = await tapPoster();
    expect(played).not.toBe(empty);
    const { error: routeError } = await host.rpc("add_match_route", {
      p_set_id: played,
      p_description: "int: played route",
      p_grade: 3,
      p_has_zone: false,
    });
    expect(routeError).toBeNull();
    expect((await host.rpc("end_match", { p_set_id: played })).error).toBeNull();

    const { data: history, error } = await service.rpc("get_match_history", {
      p_user_id: hostUserId,
      p_limit: 20,
    });
    expect(error).toBeNull();
    const ids = (history ?? []).map((h: { set_id: string }) => h.set_id);
    expect(ids).toContain(played);
    expect(ids).not.toContain(empty);
  }, 30_000);
});
