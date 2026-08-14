import { describe, expect, it } from "vitest";
import {
  emptyGymFold,
  foldGymSets,
  type FoldLog,
  type FoldRoute,
} from "./fold";

/**
 * The per-set bucketing that drives every gym badge. It sat inside
 * `buildBadgeContext` behind five awaits, so reaching it meant
 * mocking five modules and nobody ever did — these are its first
 * tests.
 */

const route = (id: string, number: number, has_zone = false): FoldRoute => ({
  id,
  number,
  has_zone,
});

const log = (partial: Partial<FoldLog> & { route_id: string }): FoldLog => ({
  set_id: "s1",
  attempts: 1,
  completed: true,
  zone: false,
  ...partial,
});

describe("emptyGymFold", () => {
  it("gives the evaluator empty maps rather than nulls", () => {
    // The gymless path relies on this: every Map access downstream is
    // unguarded, so a null here would crash match-only badge eval.
    const fold = emptyGymFold();
    expect(fold.completedRoutesBySet.size).toBe(0);
    expect(fold.totalRoutesBySet.size).toBe(0);
    expect(fold.zoneAvailableBySet.size).toBe(0);
  });

  it("returns a fresh instance each call — no shared mutable state", () => {
    const a = emptyGymFold();
    a.totalRoutesBySet.set("s1", 3);
    expect(emptyGymFold().totalRoutesBySet.size).toBe(0);
  });
});

describe("foldGymSets", () => {
  const sets = [{ id: "s1" }];
  const routes = new Map([["s1", [route("r1", 1), route("r2", 2, true)]]]);

  it("records the set's route count even with no logs", () => {
    const fold = foldGymSets(sets, routes, []);
    expect(fold.totalRoutesBySet.get("s1")).toBe(2);
    expect(fold.completedRoutesBySet.get("s1")?.size).toBe(0);
  });

  it("reports zone availability from the ROUTES, not from logs", () => {
    // A set nobody has touched must still report its zones, or the
    // all-zones badges are unreachable on a fresh set.
    const fold = foldGymSets(sets, routes, []);
    expect([...(fold.zoneAvailableBySet.get("s1") ?? [])]).toEqual([2]);
  });

  it("buckets completions and flashes by route NUMBER", () => {
    const fold = foldGymSets(sets, routes, [
      log({ route_id: "r1", attempts: 1, completed: true }),
      log({ route_id: "r2", attempts: 4, completed: true }),
    ]);
    expect([...(fold.completedRoutesBySet.get("s1") ?? [])].sort()).toEqual([1, 2]);
    // Flash is derived (attempts === 1 && completed), never stored.
    expect([...(fold.flashedRoutesBySet.get("s1") ?? [])]).toEqual([1]);
  });

  it("counts a zone claim on an uncompleted route", () => {
    // Zone is independent of completion — worth 1 point on its own.
    const fold = foldGymSets(sets, routes, [
      log({ route_id: "r2", attempts: 3, completed: false, zone: true }),
    ]);
    expect([...(fold.zoneClaimedBySet.get("s1") ?? [])]).toEqual([2]);
    expect(fold.completedRoutesBySet.get("s1")?.size).toBe(0);
  });

  it("ignores a log whose route no longer exists in the set", () => {
    // Routes can be deleted while their logs survive; an unmatched
    // route id must not invent a bucket entry.
    const fold = foldGymSets(sets, routes, [
      log({ route_id: "deleted-route" }),
    ]);
    expect(fold.completedRoutesBySet.get("s1")?.size).toBe(0);
  });

  it("ignores logs with no set_id", () => {
    const fold = foldGymSets(sets, routes, [
      log({ route_id: "r1", set_id: null }),
    ]);
    expect(fold.completedRoutesBySet.get("s1")?.size).toBe(0);
  });

  it("keeps sets separate — a log only counts for its own set", () => {
    const twoSets = [{ id: "s1" }, { id: "s2" }];
    const twoRoutes = new Map([
      ["s1", [route("r1", 1)]],
      ["s2", [route("r9", 1)]],
    ]);
    const fold = foldGymSets(twoSets, twoRoutes, [
      log({ route_id: "r1", set_id: "s1" }),
    ]);
    expect([...(fold.completedRoutesBySet.get("s1") ?? [])]).toEqual([1]);
    expect(fold.completedRoutesBySet.get("s2")?.size).toBe(0);
  });

  it("dedupes repeat logs on the same route", () => {
    // Sets, not counters: two logs on route 1 is still one route
    // completed, which is what the "all of set" badges compare against
    // totalRoutesBySet.
    const fold = foldGymSets(sets, routes, [
      log({ route_id: "r1" }),
      log({ route_id: "r1" }),
    ]);
    expect(fold.completedRoutesBySet.get("s1")?.size).toBe(1);
  });
});
