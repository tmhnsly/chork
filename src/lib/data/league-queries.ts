import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";
import { readMany, readSingle } from "./read";
import { asJsonShape } from "./json-shape";
import type { LeagueStanding, LeagueView, MyLeagueRow } from "./league-types";

type Client = SupabaseClient<Database>;

// League reads. All three RPCs gate on `auth.uid()` — the caller is
// the host or has a seat in a week — so they take the CALLER's client,
// never the service role (which has no uid and would be refused).
// Errors log + fall back to null / [] per the read contract in
// docs/architecture.md; "not found" and "not yours" are one answer.

export async function getLeague(
  supabase: Client,
  leagueId: string,
): Promise<LeagueView | null> {
  const data = await readSingle<unknown>(
    supabase.rpc("get_league", { p_league_id: leagueId }),
    "getleague_failed",
  );
  return data == null ? null : asJsonShape<LeagueView>(data);
}

export async function getLeagueStandings(
  supabase: Client,
  leagueId: string,
): Promise<LeagueStanding[]> {
  return readMany<LeagueStanding>(
    supabase.rpc("league_standings", { p_league_id: leagueId }),
    "getleaguestandings_failed",
  );
}

export async function getMyLeagues(supabase: Client): Promise<MyLeagueRow[]> {
  return readMany<MyLeagueRow>(supabase.rpc("get_my_leagues"), "getmyleagues_failed");
}
