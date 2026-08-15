/**
 * Mock factories for story fixtures and tests.
 */

import type { RouteSet, Route, RouteLog } from "@/lib/data";

const DEFAULT_DATE = "2026-04-01T00:00:00Z";

export function mockRouteSet(overrides: Partial<RouteSet> & { id: string; gym_id: string }): RouteSet {
  return {
    starts_at: "2026-04-07T00:00:00Z",
    ends_at: "2026-05-04T00:00:00Z",
    active: true,
    // Convergence columns (migration 080). A fixture is a GYM Set by
    // default — a Match would set owner_kind "climber" plus host_id
    // and code.
    owner_kind: "gym",
    host_id: null,
    code: null,
    min_grade: null,
    // Match-only (migration 084): a gym Set locates itself by gym_id,
    // and ends on its schedule rather than on inactivity.
    location: null,
    last_activity_at: null,
    // Migration 091. Chork shipped boulder-only, so that's the default
    // a fixture should look like unless a test says otherwise.
    discipline: "boulder",
    // Migration 085 — null until a player taps Share.
    share_token: null,
    // Columns added in migration 014 — defaults mirror the SQL defaults so
    // fixtures stay valid whether callers override or not.
    name: null,
    status: "live",
    grading_scale: "v",
    max_grade: 10,
    competition_id: null,
    closing_event: false,
    venue_gym_id: null,
    created_at: DEFAULT_DATE,
    updated_at: DEFAULT_DATE,
    ...overrides,
  };
}

export function mockRoute(overrides: Partial<Route> & { id: string; set_id: string; number: number }): Route {
  return {
    // Convergence columns (migration 080) — a Match route adds a
    // free-text description, its own grade, and who added it.
    // `declared_grade` is what the adder said; `community_grade`
    // below is what climbers voted (renamed in 083 so the two can't
    // be confused).
    description: null,
    added_by: null,
    declared_grade: null,
    // Null = inherit the Set's discipline (migration 091), which is
    // the common case — only a route that genuinely differs stores one.
    discipline: null,
    has_zone: false,
    setter_name: null,
    // Populated by the trigger in migration 026; mocks default to a
    // blank route with no votes yet.
    community_grade: null,
    grade_vote_count: 0,
    created_at: DEFAULT_DATE,
    updated_at: DEFAULT_DATE,
    ...overrides,
  };
}

export function mockRouteLog(overrides: Partial<RouteLog> & { id: string; user_id: string; route_id: string }): RouteLog {
  return {
    attempts: 0,
    completed: false,
    completed_at: null,
    grade_vote: null,
    zone: false,
    gym_id: "gym_001",
    // Every log belongs to a Set (migration 080). In production a
    // trigger derives this from the route; a fixture states it.
    set_id: "set_001",
    created_at: DEFAULT_DATE,
    updated_at: DEFAULT_DATE,
    ...overrides,
  };
}
