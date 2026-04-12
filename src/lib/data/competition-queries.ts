import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

type Supabase = SupabaseClient<Database>;

export interface CompetitionSummary {
  id: string;
  name: string;
  description: string | null;
  starts_at: string;
  ends_at: string | null;
  status: "draft" | "live" | "archived";
  organiser_id: string | null;
}

export interface CompetitionCategory {
  id: string;
  competition_id: string;
  name: string;
  display_order: number;
}

export interface CompetitionGymLink {
  competition_id: string;
  gym_id: string;
  gym_name: string;
  gym_slug: string;
}

export interface CompetitionParticipant {
  user_id: string;
  username: string;
  avatar_url: string;
  category_id: string | null;
}

export interface CompetitionLeaderboardRow {
  user_id: string;
  username: string;
  name: string;
  avatar_url: string;
  category_id: string | null;
  rank: number;
  sends: number;
  flashes: number;
  zones: number;
  points: number;
}

/**
 * Single competition by id. Null when the row doesn't exist or when
 * RLS hides it (competitions are publicly readable today, but keeping
 * the null-safe return shape future-proofs access changes).
 */
export async function getCompetitionById(
  supabase: Supabase,
  competitionId: string
): Promise<CompetitionSummary | null> {
  const { data, error } = await supabase
    .from("competitions")
    .select("id, name, description, starts_at, ends_at, status, organiser_id")
    .eq("id", competitionId)
    .maybeSingle();
  if (error) {
    console.warn("[chork] getCompetitionById failed:", error);
    return null;
  }
  return (data as CompetitionSummary | null) ?? null;
}

/** Every competition the caller organises — newest first. */
export async function getCompetitionsForOrganiser(
  supabase: Supabase,
  userId: string
): Promise<CompetitionSummary[]> {
  const { data, error } = await supabase
    .from("competitions")
    .select("id, name, description, starts_at, ends_at, status, organiser_id")
    .eq("organiser_id", userId)
    .order("starts_at", { ascending: false });
  if (error) {
    console.warn("[chork] getCompetitionsForOrganiser failed:", error);
    return [];
  }
  return (data ?? []) as CompetitionSummary[];
}

/** Gyms linked to a competition. Joined with the gym's name + slug. */
export async function getCompetitionGyms(
  supabase: Supabase,
  competitionId: string
): Promise<CompetitionGymLink[]> {
  const { data, error } = await supabase
    .from("competition_gyms")
    .select("competition_id, gym_id, gyms:gym_id (name, slug)")
    .eq("competition_id", competitionId);
  if (error) {
    console.warn("[chork] getCompetitionGyms failed:", error);
    return [];
  }
  return (data ?? []).flatMap((row) => {
    const gym = Array.isArray(row.gyms) ? row.gyms[0] : row.gyms;
    if (!gym) return [];
    return [{
      competition_id: row.competition_id,
      gym_id: row.gym_id,
      gym_name: gym.name,
      gym_slug: gym.slug,
    }];
  });
}

/** Categories for a competition, ordered as the organiser arranged them. */
export async function getCompetitionCategories(
  supabase: Supabase,
  competitionId: string
): Promise<CompetitionCategory[]> {
  const { data, error } = await supabase
    .from("competition_categories")
    .select("id, competition_id, name, display_order")
    .eq("competition_id", competitionId)
    .order("display_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) {
    console.warn("[chork] getCompetitionCategories failed:", error);
    return [];
  }
  return (data ?? []) as CompetitionCategory[];
}

/**
 * Has the caller joined this competition? Returns the participant row
 * or null. Shallow — used to decide whether to show the "Join" button.
 */
export async function getMyCompetitionParticipation(
  supabase: Supabase,
  competitionId: string,
  userId: string
): Promise<{ category_id: string | null } | null> {
  const { data, error } = await supabase
    .from("competition_participants")
    .select("category_id")
    .eq("competition_id", competitionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.warn("[chork] getMyCompetitionParticipation failed:", error);
    return null;
  }
  return data ?? null;
}

/** Ranked leaderboard rows via the SQL RPC. Category filter optional. */
export async function getCompetitionLeaderboard(
  supabase: Supabase,
  competitionId: string,
  categoryId: string | null = null,
  limit = 20,
  offset = 0
): Promise<CompetitionLeaderboardRow[]> {
  // Supabase's generated `.rpc()` signature treats optional parameters
  // as `string | undefined`; our callers pass `string | null` to mirror
  // the SQL default. Coerce null → undefined at the boundary.
  const { data, error } = await supabase.rpc("get_competition_leaderboard", {
    p_competition_id: competitionId,
    p_category_id: categoryId ?? undefined,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) {
    console.warn("[chork] getCompetitionLeaderboard failed:", error);
    return [];
  }
  return (data ?? []).map((r) => ({
    user_id: r.user_id,
    username: r.username,
    name: r.name,
    avatar_url: r.avatar_url,
    category_id: r.category_id,
    rank: Number(r.rank),
    sends: r.sends,
    flashes: r.flashes,
    zones: r.zones,
    points: r.points,
  }));
}
