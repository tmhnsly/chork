import { ownerIdOf } from "./match-types";
import { handicapPointsTenths } from "./handicap";
import type {
  MatchLeaderboardRow,
  MatchLog,
  MatchPlayerView,
} from "./match-types";
import { computePoints, isFlash } from "./logs";

/**
 * Derive a live match leaderboard from the current player set + log
 * map. Mirrors the server-side `get_match_leaderboard` RPC (latest
 * body: migration 063) exactly — points formula, tiebreak order, and
 * dense_rank semantics all match. scoring-parity.test.ts pins both
 * homes together.
 *
 * Known divergence, on purpose for now: `end_match` writes summary
 * ranks with `row_number()` (ties broken arbitrarily), so a tied
 * live board and the persisted summary can disagree on ties. Tie
 * handling in summaries (shared rank? shared win?) is a product
 * decision parked with the matches overhaul — see docs/roadmap.md.
 *
 * Points formula: flash=4, 2-try=3, 3-try=2, 4+=1, incomplete=0,
 * + 1 if zone — MUST match the `get_match_leaderboard` RPC. Scoring
 * delegates to `computePoints` in `logs.ts`, the single TS source
 * of that ladder.
 *
 * Tiebreak order: points desc, flashes desc, sends desc,
 * last_send_at asc nulls last. Rank uses dense_rank semantics so
 * two rows sharing the full four-column tuple get the same rank,
 * and the next distinct group jumps to the next integer.
 */
export function computeMatchLeaderboard(
  players: MatchPlayerView[],
  logs: Map<string, MatchLog>,
  /**
   * Applies the handicap when the Match has it on. Route grades come
   * in as a map because a log only knows its route id — without them
   * a handicapped send can't be scored and falls back to base points,
   * which is the same fallback the SQL takes.
   */
  options: {
    handicap?: boolean;
    gradeByRouteId?: Map<string, number | null>;
  } = {},
): MatchLeaderboardRow[] {
  const { handicap = false, gradeByRouteId } = options;
  const rows: MatchLeaderboardRow[] = players.map((p) => {
    let sends = 0;
    let flashes = 0;
    let zones = 0;
    let points = 0;
    let pointsTenths = 0;
    let attempts = 0;
    let lastSendAt: string | null = null;

    for (const log of logs.values()) {
      // Match on the SEAT, not the account — a guest's logs are owned
      // by `player_id` because they have no `user_id`. `ownerIdOf`
      // resolves both to the same string.
      if (ownerIdOf(log) !== ownerIdOf(p)) continue;
      attempts += log.attempts;
      if (log.zone) zones += 1;
      points += computePoints(log);
      pointsTenths += handicap
        ? handicapPointsTenths(
            log,
            gradeByRouteId?.get(log.route_id) ?? null,
            p.ceiling,
          )
        : computePoints(log) * 10;
      if (log.completed) {
        sends += 1;
        if (isFlash(log)) flashes += 1;
        if (
          log.completed_at
          && (!lastSendAt || log.completed_at > lastSendAt)
        ) {
          lastSendAt = log.completed_at;
        }
      }
    }

    return {
      player_id: p.player_id,
      user_id: p.user_id,
      is_guest: p.is_guest,
      username: p.username ?? null,
      display_name: p.display_name ?? null,
      avatar_url: p.avatar_url ?? null,
      sends,
      flashes,
      zones,
      points,
      points_tenths: pointsTenths,
      attempts,
      last_send_at: lastSendAt,
      rank: 0,
      // A parked seat keeps its points and its place — migration 102.
      // Carried through so the board can mark the row rather than
      // rank a name nobody can account for.
      has_left: p.has_left,
    };
  });

  rows.sort((a, b) => {
    // Ranks on the handicapped total, which equals base × 10 when the
    // handicap is off — one comparison for both modes, matching the
    // `dense_rank` clause in `match_standings`.
    if (b.points_tenths !== a.points_tenths) {
      return b.points_tenths - a.points_tenths;
    }
    if (b.flashes !== a.flashes) return b.flashes - a.flashes;
    if (b.sends !== a.sends) return b.sends - a.sends;
    if (a.last_send_at && b.last_send_at) {
      return a.last_send_at.localeCompare(b.last_send_at);
    }
    if (a.last_send_at && !b.last_send_at) return -1;
    if (!a.last_send_at && b.last_send_at) return 1;
    return 0;
  });

  // dense_rank: ties share a rank and the next distinct tuple takes
  // rank+1 (no gaps). `rank = i + 1` here would be SQL rank() — after
  // a tie the live board would show "3rd" where the RPC says "2nd".
  // scoring-parity.test.ts pins this against get_match_leaderboard.
  let prevKey = "";
  let rank = 0;
  for (const row of rows) {
    const key = `${row.points}|${row.flashes}|${row.sends}|${row.last_send_at ?? ""}`;
    if (key !== prevKey) {
      rank += 1;
      prevKey = key;
    }
    row.rank = rank;
  }
  return rows;
}
