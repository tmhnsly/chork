import type {
  JamLeaderboardRow,
  JamLog,
  JamPlayerView,
} from "./jam-types";

/**
 * Derive a live jam leaderboard from the current player set + log
 * map. Mirrors the server-side `get_jam_leaderboard` RPC
 * (migration 041) exactly — points formula, tiebreak order, and
 * dense_rank semantics all match — so the live leaderboard on a
 * running jam never desyncs with the final summary computed by
 * `end_jam`.
 *
 * Points formula: flash=4, 2-try=3, 3-try=2, 4+=1, incomplete=0,
 * + 1 if zone. Identical to `computePoints` in `logs.ts` but
 * inlined here to avoid the extra function call inside the hot
 * per-log loop.
 *
 * Tiebreak order: points desc, flashes desc, sends desc,
 * last_send_at asc nulls last. Rank uses dense_rank semantics so
 * two rows sharing the full four-column tuple get the same rank,
 * and the next distinct group jumps to the next integer.
 */
export function computeJamLeaderboard(
  players: JamPlayerView[],
  logs: Map<string, JamLog>,
): JamLeaderboardRow[] {
  const rows: JamLeaderboardRow[] = players.map((p) => {
    let sends = 0;
    let flashes = 0;
    let zones = 0;
    let points = 0;
    let attempts = 0;
    let lastSendAt: string | null = null;

    for (const log of logs.values()) {
      if (log.user_id !== p.user_id) continue;
      attempts += log.attempts;
      if (log.zone) {
        zones += 1;
        points += 1;
      }
      if (log.completed) {
        sends += 1;
        if (log.attempts === 1) {
          flashes += 1;
          points += 4;
        } else if (log.attempts === 2) {
          points += 3;
        } else if (log.attempts === 3) {
          points += 2;
        } else {
          points += 1;
        }
        if (
          log.completed_at
          && (!lastSendAt || log.completed_at > lastSendAt)
        ) {
          lastSendAt = log.completed_at;
        }
      }
    }

    return {
      user_id: p.user_id,
      username: p.username ?? null,
      display_name: p.display_name ?? null,
      avatar_url: p.avatar_url ?? null,
      sends,
      flashes,
      zones,
      points,
      attempts,
      last_send_at: lastSendAt,
      rank: 0,
    };
  });

  rows.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.flashes !== a.flashes) return b.flashes - a.flashes;
    if (b.sends !== a.sends) return b.sends - a.sends;
    if (a.last_send_at && b.last_send_at) {
      return a.last_send_at.localeCompare(b.last_send_at);
    }
    if (a.last_send_at && !b.last_send_at) return -1;
    if (!a.last_send_at && b.last_send_at) return 1;
    return 0;
  });

  let prevKey = "";
  let rank = 0;
  for (let i = 0; i < rows.length; i++) {
    const key = `${rows[i].points}|${rows[i].flashes}|${rows[i].sends}|${rows[i].last_send_at ?? ""}`;
    if (key !== prevKey) {
      rank = i + 1;
      prevKey = key;
    }
    rows[i].rank = rank;
  }
  return rows;
}
