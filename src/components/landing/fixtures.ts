import type { LeaderboardEntry, Route, RouteLog, RouteSet } from "@/lib/data";
import type { MyRank } from "@/app/(app)/rank-actions";
import { mockRoute, mockRouteLog, mockRouteSet } from "@/test/mocks";

/**
 * The people and the wall the marketing devices show.
 *
 * Built from the test mock factories rather than literals so a
 * migration that adds a column breaks the build here too, and so
 * the devices are typed against exactly what the app renders.
 *
 * Attempt privacy holds in fixtures as it does in data: only `YOU`
 * has logs. Every other climber is a board entry — points, flashes,
 * sends, zones — and never an attempt count. `fixtures.test.ts`
 * pins that. No real gym, brand or person appears.
 */

const AVATAR = ""; // the app's outlined glyph on the accent surface

export const YOU = { id: "you", username: "alex", name: "Alex", avatar_url: AVATAR } as const;

export const SET: RouteSet = mockRouteSet({
  id: "set_landing",
  gym_id: "gym_landing",
  name: "Autumn set",
});

const ZONE_ROUTES = new Set([3, 7, 11, 16, 19]);

/** A full set: twenty routes, five rows of tiles, the way a wall looks. */
export const ROUTES: Route[] = Array.from({ length: 20 }, (_, i) =>
  mockRoute({
    id: `route_${i + 1}`,
    set_id: SET.id,
    number: i + 1,
    has_zone: ZONE_ROUTES.has(i + 1),
    community_grade: [2, 3, 3, 4, 2, 5, 4, 3, 6, 4, 5, 6, 3, 4, 2, 7, 5, 3, 6, 4][i],
  }),
);

function log(routeNumber: number, attempts: number, completed: boolean, zone = false): RouteLog {
  return mockRouteLog({
    id: `log_${routeNumber}`,
    user_id: YOU.id,
    route_id: `route_${routeNumber}`,
    set_id: SET.id,
    gym_id: SET.gym_id,
    attempts,
    completed,
    zone,
  });
}

/** Your card as the hero shows it: three flashes, four sends, three in progress, route 4 untouched. */
export const YOUR_LOGS: RouteLog[] = [
  log(1, 1, true),
  log(2, 2, true),
  log(3, 3, true, true),
  log(5, 1, true),
  log(7, 2, true, true),
  log(8, 2, false),
  log(9, 1, false),
  log(13, 1, true),
  log(15, 2, true),
  log(17, 3, false),
];

/**
 * The route the "log a send" sequence taps. Untouched in YOUR_LOGS, and
 * in the top row, so it stays in view above the sheet while it is
 * being logged.
 */
export const TAPPED_ROUTE = 4;

/**
 * 25 points: three flashes (4 × 3), two sends in two (3 × 2), a send
 * in three with the zone (2 + 1), a send in two with the zone (3 + 1).
 * Third of 23 — on the podium — and three points off second.
 * `fixtures.test.ts` adds it up.
 */
export const YOUR_RANK: MyRank = {
  rank: 3,
  points: 25,
  flashes: 3,
  climberCount: 23,
  toNext: { rank: 2, points: 3 },
};

function climber(
  rank: number,
  username: string,
  name: string,
  points: number,
  flashes: number,
  sends: number,
  zones: number,
): LeaderboardEntry {
  return { user_id: `user_${username}`, username, name, avatar_url: AVATAR, rank, points, flashes, sends, zones };
}

/**
 * The top of the board, rank order: the podium and a screen's worth
 * of rows under it. `YOU` is third — on the podium, at the bottom of
 * it — which is where the board sequence starts.
 */
export const CLIMBERS: LeaderboardEntry[] = [
  climber(1, "priya_k", "Priya", 33, 5, 10, 3),
  climber(2, "sammy", "Sam", 27, 4, 8, 2),
  { user_id: YOU.id, username: YOU.username, name: YOU.name, avatar_url: AVATAR, rank: 3, points: 25, flashes: 3, sends: 7, zones: 2 },
  climber(4, "marcus", "Marcus", 21, 2, 6, 2),
  climber(5, "dev_t", "Dev", 18, 2, 5, 1),
  climber(6, "hannah.b", "Hannah", 15, 1, 5, 1),
  climber(7, "olly", "Olly", 12, 1, 4, 0),
];

/** A game between six friends on a home wall. */
export const GAME = {
  name: "Tuesday six",
  location: "Ben's garage",
  players: [
    YOU,
    { id: "user_priya_k", username: "priya_k", name: "Priya", avatar_url: AVATAR },
    { id: "user_sammy", username: "sammy", name: "Sam", avatar_url: AVATAR },
    { id: "user_marcus", username: "marcus", name: "Marcus", avatar_url: AVATAR },
    { id: "user_dev_t", username: "dev_t", name: "Dev", avatar_url: AVATAR },
    // A guest: a named seat with no account, so no handle.
    { id: "guest_jo", username: "", name: "Jo", avatar_url: AVATAR },
  ],
  /** Six routes, V-grades as the host declared them. */
  routes: [
    { number: 1, grade: "V2" },
    { number: 2, grade: "V3" },
    { number: 3, grade: "V3" },
    { number: 4, grade: "V4" },
    { number: 5, grade: "V4" },
    { number: 6, grade: "V5" },
  ],
  /** Your logs in the game before the send that wins it. Route 5 is the one. */
  yourLogs: [
    { number: 1, attempts: 1, completed: true },
    { number: 2, attempts: 2, completed: true },
    { number: 3, attempts: 1, completed: true },
    { number: 4, attempts: 3, completed: true },
  ],
  /** Top three before your send. */
  board: [
    { userId: "user_priya_k", username: "priya_k", name: "Priya", points: 16, flashes: 3 },
    { userId: YOU.id, username: YOU.username, name: YOU.name, points: 13, flashes: 2 },
    { userId: "user_sammy", username: "sammy", name: "Sam", points: 11, flashes: 2 },
  ],
} as const;
