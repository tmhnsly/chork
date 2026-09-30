import { describe, expect, it } from "vitest";
import { latestDefinition } from "@/test/sql-definitions";
import { keysOf } from "@/test/keys-of";
import type { MatchLeaderboardRow, MatchLog, MatchPlayerView, MatchState } from "./match-types";
import type { LeagueView, LeagueWeek } from "./league-types";
import type { ProfileSummary } from "./profile-queries";
import type { PlayerRow, ResultPayload } from "./shared-result";

/**
 * The payloads SQL builds field by field and TypeScript takes on
 * trust.
 *
 * A function that returns `jsonb` is `Json` to the generated types, so
 * its reader casts it to a hand-written interface (`asJsonShape`) and
 * the compiler has nothing to check. When the two part company the
 * field reads `undefined` at runtime and nothing fails. It happened:
 * migration 138 rebuilt `get_match_state_for_user` from a copy older
 * than 121 and dropped `alt_ceiling`, and the live board scored
 * mixed-day handicaps against no limit until 142.
 *
 * So for each such payload: every field the interface declares must be
 * a key the function's current definition builds. The key lists come
 * through `keysOf`, which makes adding a field to an interface without
 * adding it here a compile error. Payloads that are whole rows
 * (`to_jsonb(row)`) are pinned to the generated types instead, beside
 * their interfaces (`row-pin.ts`).
 */

/** `'key',` as a `jsonb_build_object` argument. */
function builds(sql: string, key: string): boolean {
  return new RegExp(`'${key}'\\s*,`).test(sql);
}

/** The slice of a definition between two of its top-level keys. */
function section(sql: string, from: string, to: string | null): string {
  const start = sql.indexOf(`'${from}',`);
  const end = to === null ? sql.length : sql.indexOf(`'${to}',`, start + 1);
  if (start === -1 || end === -1) {
    throw new Error(`no '${from}' … '${to}' section in the definition`);
  }
  return sql.slice(start + from.length + 3, end);
}

function expectBuilds(sql: string, keys: ReadonlyArray<string>) {
  expect(keys.filter((key) => !builds(sql, key))).toEqual([]);
}

describe("get_match_state_for_user builds what MatchState declares", () => {
  const sql = latestDefinition("get_match_state_for_user").body;

  it("the bundle's own fields", () => {
    expectBuilds(
      sql,
      keysOf<MatchState>()([
        "match",
        "grades",
        "routes",
        "players",
        "my_logs",
        "guest_logs",
        "other_logs",
        "leaderboard",
        "viewer_hidden",
      ]),
    );
  });

  it("a grade", () => {
    expectBuilds(
      section(sql, "grades", "routes"),
      keysOf<MatchState["grades"][number]>()(["ordinal", "label"]),
    );
  });

  it("a seat, with both of its limits", () => {
    expectBuilds(
      section(sql, "players", "my_logs"),
      keysOf<MatchPlayerView>()([
        "player_id",
        "user_id",
        "is_guest",
        "username",
        "display_name",
        "avatar_url",
        "joined_at",
        "is_host",
        "has_left",
        "ceiling",
        "alt_ceiling",
      ]),
    );
  });

  it("another player's log", () => {
    expectBuilds(
      section(sql, "other_logs", "leaderboard"),
      keysOf<MatchLog>()([
        "id",
        "set_id",
        "route_id",
        "user_id",
        "player_id",
        "attempts",
        "completed",
        "completed_at",
        "zone",
        "created_at",
        "updated_at",
      ]),
    );
  });

  it("a board row", () => {
    expectBuilds(
      section(sql, "leaderboard", "viewer_hidden"),
      keysOf<MatchLeaderboardRow>()([
        "player_id",
        "points_tenths",
        "user_id",
        "is_guest",
        "username",
        "display_name",
        "avatar_url",
        "sends",
        "flashes",
        "zones",
        "has_left",
        "points",
        "attempts",
        "last_send_at",
        "rank",
      ]),
    );
  });
});

describe("get_league builds what LeagueView declares", () => {
  const sql = latestDefinition("get_league").body;

  it("the view's own fields", () => {
    expectBuilds(sql, keysOf<LeagueView>()(["league", "is_host", "weeks"]));
  });

  it("a week", () => {
    expectBuilds(
      section(sql, "weeks", null),
      keysOf<LeagueWeek>()([
        "set_id",
        "name",
        "status",
        "game_mode",
        "starts_at",
        "ends_at",
        "player_count",
        "winner_user_id",
      ]),
    );
  });
});

describe("get_public_match_result builds what the shared result declares", () => {
  const sql = latestDefinition("get_public_match_result").body;

  it("the result's own fields", () => {
    expectBuilds(
      sql,
      keysOf<ResultPayload>()([
        "handicap",
        "name",
        "location",
        "ended_at",
        "player_count",
        "players",
      ]),
    );
  });

  it("a player row", () => {
    expectBuilds(
      section(sql, "players", null),
      keysOf<PlayerRow>()([
        "rank",
        "is_guest",
        "points_tenths",
        "display_name",
        "username",
        "points",
        "sends",
        "flashes",
        "zones",
        "is_winner",
      ]),
    );
  });
});

describe("get_profile_summary builds what ProfileSummary declares", () => {
  const sql = latestDefinition("get_profile_summary").body;

  it("the summary's own fields", () => {
    expectBuilds(
      sql,
      keysOf<ProfileSummary>()([
        "per_set",
        "active_set_detail",
        "total_routes_in_gym",
        "total_attempts",
        "unique_routes_attempted",
      ]),
    );
  });
});

describe("the check itself", () => {
  it("would have caught 138 dropping alt_ceiling", () => {
    const sql = latestDefinition("get_match_state_for_user").body;
    const without = sql.replace(/\s*'alt_ceiling', sp\.alt_ceiling,/, "");
    expect(without).not.toBe(sql);
    expect(builds(section(without, "players", "my_logs"), "alt_ceiling")).toBe(false);
  });
});
