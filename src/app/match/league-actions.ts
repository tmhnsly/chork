"use server";

import { gateSignedInMutation } from "@/lib/auth";
import { formatError } from "@/lib/errors";
import { isUuid } from "@/lib/validation";
import type { ActionResult } from "@/lib/action-result";

// League writes. Every rule — host only, finished Matches only, one
// League per Match, no weeks after the end — lives in the SECURITY
// DEFINER RPCs (migration 133); these validate shape, gate, call, and
// hand the RPC's own copy back through `formatError`. The League
// screen re-reads on navigation, and nothing here is cached, so there
// is no tag to bust.

const MAX_NAME_LEN = 80;

function validName(name: unknown): { name: string } | { error: string } {
  const trimmed = typeof name === "string" ? name.trim() : "";
  if (!trimmed) return { error: "Give the league a name" };
  if (trimmed.length > MAX_NAME_LEN) {
    return { error: `League names are ${MAX_NAME_LEN} characters or fewer` };
  }
  return { name: trimmed };
}

/** Make a finished Match the first week of a new League. */
export async function createLeagueAction(
  name: string,
  setId: string,
): Promise<ActionResult<{ leagueId: string }>> {
  const auth = await gateSignedInMutation(setId, "match");
  if ("error" in auth) return { error: auth.error };
  const named = validName(name);
  if ("error" in named) return named;

  const { data, error } = await auth.supabase.rpc("create_league", {
    p_name: named.name,
    p_set_id: setId,
  });
  if (error) return { error: formatError(error) };
  if (!data) return { error: "Could not create the league." };
  return { success: true, leagueId: data as string };
}

export async function renameLeagueAction(
  leagueId: string,
  name: string,
): Promise<ActionResult> {
  const auth = await gateSignedInMutation(leagueId, "league");
  if ("error" in auth) return { error: auth.error };
  const named = validName(name);
  if ("error" in named) return named;

  const { error } = await auth.supabase.rpc("rename_league", {
    p_league_id: leagueId,
    p_name: named.name,
  });
  if (error) return { error: formatError(error) };
  return { success: true };
}

/** Pull a finished Match the host ran into the League as a week. */
export async function addMatchToLeagueAction(
  leagueId: string,
  setId: string,
): Promise<ActionResult> {
  const auth = await gateSignedInMutation(leagueId, "league");
  if ("error" in auth) return { error: auth.error };
  if (!isUuid(setId)) return { error: "Invalid match" };

  const { error } = await auth.supabase.rpc("add_match_to_league", {
    p_league_id: leagueId,
    p_set_id: setId,
  });
  if (error) return { error: formatError(error) };
  return { success: true };
}

/** Take a week out. The Match itself is untouched. */
export async function removeMatchFromLeagueAction(
  leagueId: string,
  setId: string,
): Promise<ActionResult> {
  const auth = await gateSignedInMutation(leagueId, "league");
  if ("error" in auth) return { error: auth.error };
  if (!isUuid(setId)) return { error: "Invalid match" };

  const { error } = await auth.supabase.rpc("remove_match_from_league", {
    p_league_id: leagueId,
    p_set_id: setId,
  });
  if (error) return { error: formatError(error) };
  return { success: true };
}

/** Close the League: the table freezes, no more weeks can be started. */
export async function endLeagueAction(leagueId: string): Promise<ActionResult> {
  const auth = await gateSignedInMutation(leagueId, "league");
  if ("error" in auth) return { error: auth.error };

  const { error } = await auth.supabase.rpc("end_league", { p_league_id: leagueId });
  if (error) return { error: formatError(error) };
  return { success: true };
}
