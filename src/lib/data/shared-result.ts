import "server-only";

import { randomBytes } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import { formatErrorForLog } from "@/lib/errors";
import { readSingle, readMany } from "./read";

/**
 * The one seam between a shareable result and where its data lives.
 *
 * Deliberately narrow, because it's about to move: the Set
 * convergence deletes `jam_summaries` and folds Matches into the Set
 * family (see docs/roadmap.md). When that lands, only the bodies of
 * these two functions change — the share page, the OG image and the
 * share button never learn which table it came from.
 *
 * Reads go through the SERVICE client on purpose. The result page is
 * public, but it is rendered by OUR server, so nothing is granted to
 * `anon` and no RLS policy had to be loosened. Holding the token is
 * the entire capability.
 */

/** One row on the public result card. */
export interface SharedResultPlayer {
  rank: number;
  displayName: string;
  username: string;
  points: number;
  sends: number;
  flashes: number;
  zones: number;
  isWinner: boolean;
}

export interface SharedResult {
  name: string | null;
  location: string | null;
  endedAt: string;
  playerCount: number;
  players: SharedResultPlayer[];
}

/**
 * NOTE the absent field: `attempts`.
 *
 * `jam_summary_players.attempts` exists and is deliberately not
 * selected. Anyone with the link can read whatever this returns, and
 * raw attempt counts are owner-only (CONTEXT.md "Attempt privacy") —
 * so this is the strongest form of that contract: the number never
 * leaves the database. Do not add it here for a "nice stat".
 */
const PLAYER_COLUMNS =
  "rank, display_name, username, points, sends, flashes, zones, is_winner";

interface PlayerRow {
  rank: number;
  display_name: string;
  username: string;
  points: number;
  sends: number;
  flashes: number;
  zones: number;
  is_winner: boolean;
}

/** Public read. Null when the token doesn't resolve — callers 404. */
export async function getSharedResult(
  token: string,
): Promise<SharedResult | null> {
  // Cheap shape guard before touching the DB: tokens are base64url of
  // 24 bytes, so anything else is a probe rather than a real link.
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;

  const service = createServiceClient();
  const summary = await readSingle<{
    id: string;
    name: string | null;
    location: string | null;
    ended_at: string;
    player_count: number;
  }>(
    service
      .from("jam_summaries")
      .select("id, name, location, ended_at, player_count")
      .eq("share_token", token)
      .maybeSingle(),
    "getsharedresult_summary_failed",
  );
  if (!summary) return null;

  const players = await readMany<PlayerRow>(
    service
      .from("jam_summary_players")
      .select(PLAYER_COLUMNS)
      .eq("jam_summary_id", summary.id)
      .order("rank", { ascending: true }),
    "getsharedresult_players_failed",
  );

  return {
    name: summary.name,
    location: summary.location,
    endedAt: summary.ended_at,
    playerCount: summary.player_count,
    players: players.map((p) => ({
      rank: p.rank,
      displayName: p.display_name,
      username: p.username,
      points: p.points,
      sends: p.sends,
      flashes: p.flashes,
      zones: p.zones,
      isWinner: p.is_winner,
    })),
  };
}

/**
 * Mint (or return the existing) share token for a result.
 *
 * Caller MUST have already established that this user took part —
 * `getJamSummaryForUser` is that gate and it 404s for everyone else,
 * so re-checking here would be a second thing to keep correct rather
 * than a second layer of safety.
 *
 * Idempotent: sharing twice yields the same link, so a result has one
 * canonical URL no matter how many people share it.
 */
export async function mintShareToken(
  summaryId: string,
): Promise<string | null> {
  const service = createServiceClient();

  const existing = await readSingle<{ share_token: string | null }>(
    service
      .from("jam_summaries")
      .select("share_token")
      .eq("id", summaryId)
      .maybeSingle(),
    "mintsharetoken_read_failed",
  );
  if (existing?.share_token) return existing.share_token;

  // 24 bytes ≈ 32 base64url chars. Unguessable, and short enough to
  // survive a WhatsApp preview without wrapping.
  const token = randomBytes(24).toString("base64url");
  const { error } = await service
    .from("jam_summaries")
    .update({ share_token: token })
    .eq("id", summaryId);
  if (error) {
    logger.error("mintsharetoken_write_failed", {
      err: formatErrorForLog(error),
    });
    return null;
  }
  return token;
}
