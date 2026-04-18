// Jam writes. All go through SECURITY DEFINER RPCs defined in
// migrations 041 + 042. Functions throw on failure; the server
// action caller wraps in try/catch and forwards via formatError.

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";
import type { JamGradingScale, JamLog, JamPlayer, JamRoute } from "./jam-types";

type Client = SupabaseClient<Database>;

// Supabase generates optional RPC parameters as `T | undefined`
// rather than `T | null`. Our domain layer models "absent" as
// `null` (matches Postgres semantics everywhere else in the app),
// so we normalise at the RPC boundary rather than push nulls
// through. `undef()` folds null → undefined in one place so the
// individual mutation bodies stay narrow.
function undef<T>(value: T | null | undefined): T | undefined {
  return value ?? undefined;
}

export interface CreateJamParams {
  name: string | null;
  location: string | null;
  gradingScale: JamGradingScale;
  minGrade: number | null;
  maxGrade: number | null;
  customGrades: string[] | null;
  saveScaleName: string | null;
}

export async function createJam(
  supabase: Client,
  params: CreateJamParams,
): Promise<{ id: string; code: string }> {
  const { data, error } = await supabase.rpc("create_jam", {
    p_name: undef(params.name),
    p_location: undef(params.location),
    p_grading_scale: params.gradingScale,
    p_min_grade: undef(params.minGrade),
    p_max_grade: undef(params.maxGrade),
    p_custom_grades: undef(params.customGrades),
    p_save_scale_name: undef(params.saveScaleName),
  });
  if (error) throw error;
  const rows = (data ?? []) as Array<{ id: string; code: string }>;
  if (rows.length === 0) throw new Error("Jam creation returned no rows");
  return rows[0];
}

export async function joinJam(
  supabase: Client,
  jamId: string,
): Promise<JamPlayer> {
  const { data, error } = await supabase.rpc("add_jam_player", {
    p_jam_id: jamId,
  });
  if (error) throw error;
  return data as JamPlayer;
}

export async function leaveJam(
  supabase: Client,
  jamId: string,
): Promise<JamPlayer> {
  const { data, error } = await supabase.rpc("leave_jam", {
    p_jam_id: jamId,
  });
  if (error) throw error;
  return data as JamPlayer;
}

export async function addJamRoute(
  supabase: Client,
  params: {
    jamId: string;
    description: string | null;
    grade: number | null;
    hasZone: boolean;
  },
): Promise<JamRoute> {
  const { data, error } = await supabase.rpc("add_jam_route", {
    p_jam_id: params.jamId,
    p_description: undef(params.description),
    p_grade: undef(params.grade),
    p_has_zone: params.hasZone,
  });
  if (error) throw error;
  return data as JamRoute;
}

export async function updateJamRoute(
  supabase: Client,
  params: {
    routeId: string;
    description: string | null;
    grade: number | null;
    hasZone: boolean;
  },
): Promise<JamRoute> {
  const { data, error } = await supabase.rpc("update_jam_route", {
    p_route_id: params.routeId,
    p_description: undef(params.description),
    p_grade: undef(params.grade),
    p_has_zone: params.hasZone,
  });
  if (error) throw error;
  return data as JamRoute;
}

export async function upsertJamLog(
  supabase: Client,
  params: {
    jamRouteId: string;
    attempts: number;
    completed: boolean;
    zone: boolean;
  },
): Promise<JamLog> {
  const { data, error } = await supabase.rpc("upsert_jam_log", {
    p_jam_route_id: params.jamRouteId,
    p_attempts: params.attempts,
    p_completed: params.completed,
    p_zone: params.zone,
  });
  if (error) throw error;
  return data as JamLog;
}

export async function endJam(
  supabase: Client,
  jamId: string,
): Promise<string> {
  const { data, error } = await supabase.rpc("end_jam_as_player", {
    p_jam_id: jamId,
  });
  if (error) throw error;
  return data as string;
}

