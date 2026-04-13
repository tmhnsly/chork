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
    created_at: DEFAULT_DATE,
    updated_at: DEFAULT_DATE,
    ...overrides,
  };
}
