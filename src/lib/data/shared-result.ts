import "server-only";

import { randomBytes } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import { formatErrorForLog } from "@/lib/errors";
import { readSingle } from "./read";
import { asJsonShape } from "./json-shape";

/**
 * The one seam between a shareable result and where its data lives.
 *
 * It has now earned its keep: the Set convergence moved results off
 * `jam_summaries` and onto the `sets` family, and only the two
 * function bodies below changed. The share page, the OG image and the
 * share button never learned which table it came from, and the token
 * in an already-shared link keeps resolving.
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
 * It is not merely unselected here — `get_public_match_result` does
 * not return it at all. Anyone with the link can read whatever this
 * returns, and raw attempt counts are owner-only (CONTEXT.md "Attempt
 * privacy"), so the contract is enforced at the strongest point: the
 * number never leaves the database, and there is no viewer to mask it
 * against on a public page. Do not add it for a "nice stat".
 */
interface PlayerRow {
  rank: number;
  display_name: string | null;
  username: string | null;
  points: number;
  sends: number;
  flashes: number;
  zones: number;
  is_winner: boolean;
}

interface ResultPayload {
  name: string | null;
  location: string | null;
  ended_at: string | null;
  player_count: number;
  players: PlayerRow[];
}

/** Public read. Null when the token doesn't resolve — callers 404. */
export async function getSharedResult(
  token: string,
): Promise<SharedResult | null> {
  // Cheap shape guard before touching the DB: tokens are base64url of
  // 24 bytes, so anything else is a probe rather than a real link.
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;

  const service = createServiceClient();
  const { data, error } = await service.rpc("get_public_match_result", {
    p_token: token,
  });
  if (error) {
    logger.warn("getsharedresult_failed", { err: formatErrorForLog(error) });
    return null;
  }
  if (data == null) return null;

  const result = asJsonShape<ResultPayload>(data);
  // A Match still running has no end date. It also has no business on
  // a "result" card, so treat it as unresolvable rather than render a
  // half-finished board to the internet.
  if (!result.ended_at) return null;

  return {
    name: result.name,
    location: result.location,
    endedAt: result.ended_at,
    playerCount: result.player_count,
    players: (result.players ?? []).map((p) => ({
      rank: p.rank,
      // The board reads live profiles now rather than names copied at
      // end time, so a deleted account resolves to null. Keep the row
      // — the standings are the point, and a gap in the ranks would
      // read as a bug.
      displayName: p.display_name ?? p.username ?? "Unknown climber",
      username: p.username ?? "unknown",
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
 * `getJamStateForUser` is that gate and it 404s for everyone else, so
 * re-checking here would be a second thing to keep correct rather
 * than a second layer of safety.
 *
 * Idempotent: sharing twice yields the same link, so a result has one
 * canonical URL no matter how many people share it.
 */
export async function mintShareToken(
  setId: string,
): Promise<string | null> {
  const service = createServiceClient();

  const existing = await readSingle<{ share_token: string | null }>(
    service
      .from("sets")
      .select("share_token")
      .eq("id", setId)
      .maybeSingle(),
    "mintsharetoken_read_failed",
  );
  if (existing?.share_token) return existing.share_token;

  // 24 bytes ≈ 32 base64url chars. Unguessable, and short enough to
  // survive a WhatsApp preview without wrapping.
  const token = randomBytes(24).toString("base64url");
  const { error } = await service
    .from("sets")
    .update({ share_token: token })
    .eq("id", setId);
  if (error) {
    logger.error("mintsharetoken_write_failed", {
      err: formatErrorForLog(error),
    });
    return null;
  }
  return token;
}
