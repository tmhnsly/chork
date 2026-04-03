/**
 * Mock factories for story fixtures and tests.
 * Handles branded string types from pocketbase-typegen.
 */

import type {
  IsoAutoDateString,
  Collections,
} from "@/lib/pocketbase-types";
import type { RouteSet, Route, RouteLog } from "@/lib/data";

// Helper to create branded date strings from plain strings
function autodate(s: string): IsoAutoDateString {
  return s as IsoAutoDateString;
}

const DEFAULT_DATE = autodate("2026-04-01T00:00:00Z");

export function mockRouteSet(overrides: Partial<RouteSet> & { id: string; collectionName: Collections }): RouteSet {
  return {
    collectionId: "",
    starts_at: "2026-04-07T00:00:00Z",
    ends_at: "2026-05-04T00:00:00Z",
    active: true,
    created: DEFAULT_DATE,
    updated: DEFAULT_DATE,
    ...overrides,
  };
}

export function mockRoute(overrides: Partial<Route> & { id: string; collectionName: Collections; set_id: string; number: number }): Route {
  return {
    collectionId: "",
    has_zone: false,
    created: DEFAULT_DATE,
    updated: DEFAULT_DATE,
    ...overrides,
  };
}

export function mockRouteLog(overrides: Partial<RouteLog> & { id: string; collectionName: Collections; user_id: string; route_id: string }): RouteLog {
  return {
    collectionId: "",
    attempts: 0,
    completed: false,
    completed_at: "",
    grade_vote: 0,
    zone: false,
    created: DEFAULT_DATE,
    updated: DEFAULT_DATE,
    ...overrides,
  };
}
