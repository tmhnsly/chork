import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { latestDefinition } from "@/test/sql-definitions";
import { visibleAttempts } from "./logs";

/**
 * The attempt-privacy contract, pinned. See CONTEXT.md "Attempt
 * privacy" for the two rules and why they differ.
 *
 * Short version: raw attempt counts are owner-only, but "raw" means
 * two different things at two different grains, so there are two
 * collapses, not one.
 *
 *   • **Aggregate grain** (a player's total attempts across a jam):
 *     masked to 0 in SQL. It has no display or derivation role for
 *     anyone but the owner, so it is simply withheld.
 *   • **Per-log grain** (one climber, one route): collapsed to the
 *     buckets {0, 1, 2} by `visibleAttempts`. It cannot be withheld,
 *     because tile state (empty / attempted / flash / completed) is
 *     derived from it and flash is PUBLIC — it's a leaderboard column.
 *
 * These tests exist because the leak they guard has already happened
 * twice: migration 052 fixed it on the post-jam summary hydrator and
 * migration 056 fixed the same leak on the live leaderboard RPC. Both
 * were caught by review, not by a test — a later `create or replace`
 * that drops the mask would ship silently. `create or replace`
 * semantics mean the LIVE definition is the last one in filename
 * order, which is what `latestDefinition` resolves.
 */

// ── SQL side: the aggregate mask must survive every redefinition ──

describe("aggregate attempt mask (SQL)", () => {
  /** Masked RPCs → the column expression that must stay guarded. */
  const MASKED_RPCS = [
    {
      fn: "get_jam_leaderboard",
      // Live board: masks its own aggregate before returning it.
      column: "attempts",
    },
    {
      fn: "get_jam_summary_for_user",
      // Post-jam summary hydrator: masks jam_summary_players.attempts.
      column: "attempts",
    },
    {
      fn: "get_match_leaderboard",
      // The converged live board (migration 084). Same mask, resolved
      // against `v_viewer` — which is auth.uid() for an authenticated
      // caller and the named viewer only when auth.uid() is null, so
      // it cannot be spoofed into revealing someone else's count.
      column: "attempts",
    },
  ];

  // `case when <alias>.user_id = <owner> then <alias>.attempts else 0`,
  // where <owner> is `(select auth.uid())` for caller-context RPCs,
  // the `p_user_id` argument for service-role hydrators, or the
  // `v_viewer` binding that resolves between the two. Table aliases
  // are optional so a rename or reformat doesn't fail a behavioural
  // assertion — but the mask itself must be there. Each alternative
  // is enumerated rather than matched with `\w+`: a wildcard here
  // would happily accept `case when user_id = user_id`, which masks
  // nothing at all.
  const MASK =
    /case when (?:\w+\.)?(?:agg_)?user_id = (?:\(select auth\.uid\(\)\)|p_user_id|v_viewer) then (?:\w+\.)?attempts else 0/;

  it.each(MASKED_RPCS)(
    "$fn masks non-owner attempts to zero",
    ({ fn }) => {
      const { body, file } = latestDefinition(fn);
      const collapsed = body.replace(/\s+/g, " ");
      expect(
        MASK.test(collapsed),
        `${fn} (live definition in ${file}) no longer masks non-owner attempts. ` +
          `Raw aggregate attempt counts are owner-only — see CONTEXT.md "Attempt privacy". ` +
          `This exact leak shipped twice before (fixed in migrations 052 and 056).`,
      ).toBe(true);
    },
  );

  it("get_match_state_for_user inherits the mask rather than re-deriving it", () => {
    // Same contract as the jam hydrator below: the bundle's board
    // comes straight from get_match_leaderboard (already masked), and
    // `my_logs` is filtered to the caller. If it ever reads attempts
    // out of route_logs for anyone else it needs its own mask.
    const { body, file } = latestDefinition("get_match_state_for_user");
    expect(
      body.includes("get_match_leaderboard"),
      `get_match_state_for_user (live definition in ${file}) no longer sources ` +
        `its leaderboard from get_match_leaderboard, so it no longer inherits ` +
        `that RPC's attempt mask. Add an explicit mask or re-point it.`,
    ).toBe(true);
    expect(
      /where rl\.set_id = p_set_id\s+and rl\.user_id = p_user_id/.test(body),
      `get_match_state_for_user (live definition in ${file}) no longer scopes ` +
        `my_logs to the caller. Raw per-log attempt counts for other players ` +
        `must never reach a client — see CONTEXT.md "Attempt privacy".`,
    ).toBe(true);
  });

  it("get_jam_state_for_user inherits the mask rather than re-deriving it", () => {
    // The hydrator passes `lb.attempts` straight through from
    // get_jam_leaderboard (already masked) and returns `my_logs` for
    // the caller only. If it ever selects attempts from jam_logs
    // directly it needs its own mask — this test says so out loud.
    const { body, file } = latestDefinition("get_jam_state_for_user");
    expect(
      body.includes("get_jam_leaderboard"),
      `get_jam_state_for_user (live definition in ${file}) no longer sources ` +
        `its leaderboard from get_jam_leaderboard, so it no longer inherits ` +
        `that RPC's attempt mask. Add an explicit mask or re-point it.`,
    ).toBe(true);
  });
});

// ── TS side: the per-log bucket collapse ──

describe("per-log attempt collapse (visibleAttempts)", () => {
  it("passes the owner's own count through untouched", () => {
    for (const attempts of [0, 1, 2, 3, 17, 999]) {
      expect(
        visibleAttempts({ attempts, completed: true }, true),
      ).toBe(attempts);
    }
  });

  it("collapses every non-owner value into {0, 1, 2} — nothing else escapes", () => {
    const seen = new Set<number>();
    for (const attempts of [0, 1, 2, 3, 4, 5, 10, 99, 999]) {
      for (const completed of [true, false]) {
        seen.add(visibleAttempts({ attempts, completed }, false));
      }
    }
    expect([...seen].sort()).toEqual([0, 1, 2]);
  });

  it("preserves the flash signal, because flash is public", () => {
    // A flash is a leaderboard column shown with a bolt icon — hiding
    // it here would contradict the rest of the app. This is the whole
    // reason the per-log rule buckets instead of zeroing.
    expect(visibleAttempts({ attempts: 1, completed: true }, false)).toBe(1);
  });

  it("gives every non-flash completion the SAME value — no ranking by effort", () => {
    // 2 tries and 40 tries must be indistinguishable to a viewer.
    const two = visibleAttempts({ attempts: 2, completed: true }, false);
    const forty = visibleAttempts({ attempts: 40, completed: true }, false);
    expect(two).toBe(forty);
  });

  it("emits no 'in progress' signal for an uncompleted route", () => {
    // Non-zero here would tell a viewer someone is currently working a
    // route — an activity leak the coarse-timestamp rule also guards
    // against (see relativeDay in crew-time.ts).
    for (const attempts of [1, 5, 99]) {
      expect(visibleAttempts({ attempts, completed: false }, false)).toBe(0);
    }
  });
});

// ── Boundary: the derived-shape wire format never regains attempts ──

describe("SanitisedLog wire shape", () => {
  it("ships derived tile inputs, never an attempts field", () => {
    // fetchClimberSheetLogs is the one surface that hands another
    // climber's logs to the browser wholesale. It deliberately drops
    // `attempts` and ships `is_flash` / `has_attempts` instead, so the
    // raw number never crosses the wire at all — the strongest form of
    // the contract. Adding `attempts` back here would be a silent
    // regression that no type error catches.
    const source = readFileSync(
      join(process.cwd(), "src/app/leaderboard/actions.ts"),
      "utf8",
    );
    const shape = source.slice(
      source.indexOf("export interface SanitisedLog"),
      source.indexOf("}", source.indexOf("export interface SanitisedLog")),
    );
    expect(shape).not.toMatch(/^\s*attempts\b/m);
    expect(shape).toMatch(/is_flash/);
    expect(shape).toMatch(/has_attempts/);
  });
});
