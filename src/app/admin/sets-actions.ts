"use server";

import { updateTag } from "next/cache";
import { gateGymAdminMutation } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { formatError, formatErrorForLog } from "@/lib/errors";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { UUID_RE } from "@/lib/validation";
import { getGym } from "@/lib/data/gym-queries";
import { formatSetLabel } from "@/lib/data/set-label";
import { getGymClimberUserIds } from "@/lib/push/server";
import { announce } from "@/lib/announce";
import { logger } from "@/lib/logger";
import { tags } from "@/lib/cache/tags";

import type { ActionResult } from "@/lib/action-result";

// ────────────────────────────────────────────────────────────────
// Sets
// ────────────────────────────────────────────────────────────────

// Status widens to include "archived" on update (archive action). On
// create only draft/live make sense.
type SetStatus = "draft" | "live" | "archived";

interface SetFormInput {
  gymId: string;
  name: string;
  startsAt: string;
  endsAt: string;
  gradingScale: "v" | "font" | "points";
  maxGrade: number;
  status: SetStatus;
  closingEvent?: boolean;
  venueGymId?: string | null;
  competitionId?: string | null;
  /**
   * Quick-create: seed `count` numbered routes in the same action so
   * the Wall's 30-second flow (CreateSetForm) is one round trip. The
   * admin console omits this and adds routes in the routes editor.
   */
  routes?: { count: number; zoneRouteNumbers: number[] };
}

/**
 * Validate whichever fields a caller supplied.
 *
 * Split out from `validateSetInput` because `updateSet` takes a
 * `Partial` and previously validated NOTHING but the set id — so the
 * client `<input max={30}>` was the only thing standing between a
 * crafted call and `max_grade: 9999` / an inverted date range. Create
 * and update now share one rule set; create additionally requires the
 * fields to be present at all.
 */
function validateSetPatch(form: Partial<SetFormInput>): string | null {
  if (
    form.startsAt !== undefined &&
    form.endsAt !== undefined &&
    new Date(form.startsAt) > new Date(form.endsAt)
  ) {
    return "End date must be on or after the start date.";
  }
  if (
    form.gradingScale !== undefined &&
    !["v", "font", "points"].includes(form.gradingScale)
  ) {
    return "Invalid grading scale.";
  }
  if (
    form.maxGrade !== undefined &&
    (!Number.isInteger(form.maxGrade) || form.maxGrade < 0 || form.maxGrade > 30)
  ) {
    return "Max grade must be between 0 and 30.";
  }
  if (form.status !== undefined && !["draft", "live", "archived"].includes(form.status)) {
    return "Invalid status.";
  }
  if (form.routes !== undefined) {
    if (
      !Number.isInteger(form.routes.count) ||
      form.routes.count < 1 ||
      form.routes.count > 100
    ) {
      return "Route count must be between 1 and 100.";
    }
    if (!Array.isArray(form.routes.zoneRouteNumbers)) {
      return "Invalid zone route list.";
    }
  }
  return null;
}

function validateSetInput(form: SetFormInput): string | null {
  if (!UUID_RE.test(form.gymId)) return "Invalid gym.";
  if (!form.startsAt || !form.endsAt) return "Start and end dates are required.";
  return validateSetPatch(form);
}

// ── A Set going live ───────────────────────────────────────────────
//
// One step, shared by creating a Set straight to live and publishing a
// draft. The three rules (a Set needs a route, the incumbent is
// archived, climbers are told) were written out in both actions and
// had drifted; the first two were also two statements, archive then
// write, so a failure between them left a gym with no live Set.

/** A live Set with no routes is an empty Wall, and a push for nothing. */
const NO_ROUTES = "Add at least one route before publishing this set.";

/**
 * Publish a Set that already exists. `publish_set` (migration 145) does
 * the swap in one transaction: it refuses a Set with no routes,
 * archives whatever is live at the gym, and makes this one live. One
 * live Set per gym is also a unique index now, so nothing else can
 * leave two. Climbers are told only once it has happened (CONTEXT.md
 * "Announcement"); that part is best-effort and never fails a publish.
 */
async function goLive(
  supabase: SupabaseClient<Database>,
  setId: string,
  gymId: string,
  label: { name: string | null; starts_at: string; ends_at: string },
): Promise<{ error: string } | null> {
  const { error } = await supabase.rpc("publish_set", { p_set_id: setId });
  if (error) return { error: formatError(error) };

  try {
    const [userIds, gym] = await Promise.all([getGymClimberUserIds(gymId), getGym(gymId)]);
    announce({
      userIds,
      title: `New set at ${gym?.name ?? "your gym"}`,
      body: `${formatSetLabel(label)} is now live. Get climbing.`,
    });
  } catch (err) {
    logger.warn("set_live_announce_preparation_failed", { err: formatErrorForLog(err) });
  }
  return null;
}

/**
 * The one set-creation path. Both the admin console form and the
 * home-page quick-create (CreateSetForm) go through here — they used
 * to be two separate `createSet` actions with different validation,
 * auth gates, tag busts, and incumbent handling, and every fix landed
 * on one path only.
 */
export async function createSet(
  form: SetFormInput
): Promise<ActionResult<{ setId: string }>> {
  // Create-time: force status into {draft, live} — you can't conjure
  // an archived set from thin air. Capture in a typed local so flow
  // analysis narrows without `as`; mutating `form.status` directly
  // doesn't narrow because mutation breaks TS's control-flow tracking.
  const createStatus: "draft" | "live" =
    form.status === "archived" ? "draft" : form.status;
  const validation = validateSetInput({ ...form, status: createStatus });
  if (validation) return { error: validation };

  const auth = await gateGymAdminMutation(form.gymId, "gym");
  if ("error" in auth) return { error: auth.error };

  // On create the only way to have routes is to seed them in the same
  // call, so publishing straight to live requires `routes`. Refused
  // here, before anything is written.
  if (createStatus === "live" && !form.routes) return { error: NO_ROUTES };

  const { data, error } = await auth.supabase
    .from("sets")
    .insert({
      gym_id: form.gymId,
      name: form.name.trim() || null,
      starts_at: form.startsAt,
      ends_at: form.endsAt,
      grading_scale: form.gradingScale,
      max_grade: form.maxGrade,
      // Always born a draft. A Set created "live" is published below,
      // once it and its routes exist, so the incumbent is only ever
      // archived in the same transaction that replaces it. This used to
      // archive the incumbent first and insert second: a failed insert
      // left the gym with no live Set.
      status: "draft",
      closing_event: !!form.closingEvent,
      venue_gym_id: form.venueGymId ?? null,
      competition_id: form.competitionId ?? null,
    })
    .select("id")
    .single();
  if (error || !data) return { error: formatError(error) };

  if (form.routes) {
    const zoneSet = new Set(
      form.routes.zoneRouteNumbers.filter(
        (n) => Number.isInteger(n) && n > 0 && n <= form.routes!.count,
      ),
    );
    const rows = Array.from({ length: form.routes.count }, (_, i) => ({
      set_id: data.id,
      number: i + 1,
      has_zone: zoneSet.has(i + 1),
    }));
    const { error: routesError } = await auth.supabase
      .from("routes")
      .insert(rows);
    if (routesError) return { error: formatError(routesError) };
    updateTag(tags.setRoutes(data.id));
  }

  // A set created straight to live is the same domain event as
  // publishing a draft, so it gets the same Announcement (CONTEXT.md
  // "Announcement"). Only the home-page quick-create reaches this —
  // the admin console creates drafts and publishes via updateSet.
  // Previously which path the admin happened to use silently decided
  // whether climbers heard about the new set at all.
  if (createStatus === "live") {
    const failed = await goLive(auth.supabase, data.id, form.gymId, {
      name: form.name,
      starts_at: form.startsAt,
      ends_at: form.endsAt,
    });
    // The Set and its routes are saved; only the publish didn't happen,
    // and the Wall still shows what it showed. Say which.
    if (failed) return { error: `${failed.error} The set was saved as a draft.` };
  }

  updateTag(tags.gymActiveSet(form.gymId));
  return { success: true, setId: data.id };
}

export async function updateSet(
  setId: string,
  form: Partial<SetFormInput>
): Promise<ActionResult> {
  if (!UUID_RE.test(setId)) return { error: "Invalid set." };

  // Ownership check: confirm caller admins the gym that owns this set.
  // Also read the previous status + set name so we can detect the
  // draft→live transition and dispatch notifications below.
  const service = createServiceClient();
  const { data: setRow } = await service
    .from("sets")
    .select("gym_id, owner_kind, status, name, starts_at, ends_at")
    .eq("id", setId)
    .maybeSingle();
  if (!setRow) return { error: "Set not found." };

  // `sets` hosts climber-run Matches too since the convergence
  // (migration 080), and `gym_id` is null on those. This is the gym
  // admin surface — a Match is edited by its players, not from here —
  // so refuse rather than let a null gym reach requireGymAdmin.
  if (setRow.owner_kind !== "gym" || !setRow.gym_id) {
    return { error: "Set not found." };
  }
  const gymId = setRow.gym_id;

  // `gymId` is server-derived from the set row, never the client's —
  // the gate re-checks it for shape, re-verifies admin rights, and
  // applies the write limit that `requireGymAdmin` alone skips.
  const auth = await gateGymAdminMutation(gymId, "gym", {
    rateLimit: "mutationsWrite",
  });
  if ("error" in auth) return { error: auth.error };

  // Validate the RESULTING set, not just the supplied fields: a patch
  // that moves only `startsAt` still has to land on or before the
  // stored `ends_at`. Until 2026-08 this path validated nothing at
  // all, so the client's `<input max={30}>` was the only guard.
  const validation = validateSetPatch({
    ...form,
    startsAt: form.startsAt ?? setRow.starts_at,
    // `ends_at` went nullable in the convergence (a Match has no
    // fixed end). Gym Sets always have one, but the type can't know
    // that — `undefined` skips the range check rather than comparing
    // against null.
    endsAt: form.endsAt ?? setRow.ends_at ?? undefined,
  });
  if (validation) return { error: validation };

  const goingLive = setRow.status !== "live" && form.status === "live";

  // Patch typed against the generated Database type so Supabase can
  // validate column names; only keys the caller supplied are included
  // (omitted fields stay as-is in the DB).
  type SetUpdate = Database["public"]["Tables"]["sets"]["Update"];
  const patch: SetUpdate = {};
  // Only touch name when the caller sent one — the previous shape
  // passed `form.name?.trim() || null` unconditionally, so status-only
  // updates (archiveSet / publishSet / unpublishSet) silently wiped
  // the set's stored name.
  if (form.name !== undefined) patch.name = form.name.trim() || null;
  if (form.startsAt !== undefined) patch.starts_at = form.startsAt;
  if (form.endsAt !== undefined) patch.ends_at = form.endsAt;
  if (form.gradingScale !== undefined) patch.grading_scale = form.gradingScale;
  if (form.maxGrade !== undefined) patch.max_grade = form.maxGrade;
  // Going live is `publish_set`'s job, not a column write: see goLive.
  if (form.status !== undefined && !goingLive) patch.status = form.status;
  if (form.closingEvent !== undefined) patch.closing_event = form.closingEvent;
  if (form.venueGymId !== undefined) patch.venue_gym_id = form.venueGymId;
  if (form.competitionId !== undefined) patch.competition_id = form.competitionId;

  if (Object.keys(patch).length > 0) {
    // Ask for the row back. An UPDATE that row-level security filters
    // out is not an error: it changes nothing and says nothing. This
    // action believed that silence for five months, while `sets` had
    // no UPDATE policy at all (migration 145).
    const { data: updated, error } = await auth.supabase
      .from("sets")
      .update(patch)
      .eq("id", setId)
      .select("id")
      .maybeSingle();
    if (error) return { error: formatError(error) };
    if (!updated) return { error: "That set couldn't be changed." };
  }

  if (goingLive) {
    const failed = await goLive(auth.supabase, setId, gymId, {
      name: form.name ?? setRow.name,
      starts_at: form.startsAt ?? setRow.starts_at,
      // Gym Sets always carry an end date; the column is only nullable
      // because Matches share the table now. Falling back to the start
      // keeps the label a valid range rather than "Invalid Date".
      ends_at: form.endsAt ?? setRow.ends_at ?? setRow.starts_at,
    });
    if (failed) {
      // Any other fields in the patch were saved above.
      updateTag(tags.gymActiveSet(gymId));
      return failed;
    }
  }

  updateTag(tags.gymActiveSet(gymId));
  // Status transitions affect leaderboard semantics for the set.
  updateTag(tags.setLeaderboard(setId));
  return { success: true };
}

export async function archiveSet(setId: string): Promise<ActionResult> {
  return updateSet(setId, { status: "archived" });
}

export async function publishSet(setId: string): Promise<ActionResult> {
  return updateSet(setId, { status: "live" });
}

export async function unpublishSet(setId: string): Promise<ActionResult> {
  return updateSet(setId, { status: "draft" });
}
