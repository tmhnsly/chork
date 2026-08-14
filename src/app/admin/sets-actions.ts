"use server";

import { revalidateTag } from "next/cache";
import { gateGymAdminMutation, requireGymAdmin } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { formatError, formatErrorForLog } from "@/lib/errors";
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

  // Same rule updateSet's go-live branch enforces: a live set with no
  // routes is an empty Wall. On create the only way to have routes is
  // to seed them in the same call, so publishing straight to live
  // requires `routes`. Without this guard, /admin/sets/new → Publish
  // archived the incumbent AND left the gym with a blank Wall.
  if (createStatus === "live" && !form.routes) {
    return { error: "Add at least one route before publishing this set." };
  }

  // One live set per gym (CLAUDE.md convention, enforced here and in
  // updateSet's go-live branch): creating a live set archives any
  // incumbent first. Abort if the archive fails — inserting the new
  // live set anyway would leave two live sets and getCurrentSet would
  // pick one non-deterministically. The migration-003 trigger derives
  // the legacy `active` boolean from `status`, so old readers stay
  // correct.
  if (createStatus === "live") {
    const { error: archiveError } = await auth.supabase
      .from("sets")
      .update({ status: "archived" })
      .eq("gym_id", form.gymId)
      .eq("status", "live");
    if (archiveError) return { error: formatError(archiveError) };
  }

  const { data, error } = await auth.supabase
    .from("sets")
    .insert({
      gym_id: form.gymId,
      name: form.name.trim() || null,
      starts_at: form.startsAt,
      ends_at: form.endsAt,
      grading_scale: form.gradingScale,
      max_grade: form.maxGrade,
      status: createStatus,
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
    revalidateTag(tags.setRoutes(data.id), "max");
  }

  // A set created straight to live is the same domain event as
  // publishing a draft, so it gets the same Announcement (CONTEXT.md
  // "Announcement"). Only the home-page quick-create reaches this —
  // the admin console creates drafts and publishes via updateSet.
  // Previously which path the admin happened to use silently decided
  // whether climbers heard about the new set at all.
  if (createStatus === "live") {
    try {
      const [userIds, gym] = await Promise.all([
        getGymClimberUserIds(form.gymId),
        getGym(form.gymId),
      ]);
      announce({
        userIds,
        title: `New set at ${gym?.name ?? "your gym"}`,
        body: `${formatSetLabel({
          name: form.name,
          starts_at: form.startsAt,
          ends_at: form.endsAt,
        })} is now live. Get climbing.`,
      });
    } catch (err) {
      logger.warn("set_live_announce_preparation_failed", {
        err: formatErrorForLog(err),
      });
    }
  }

  revalidateTag(tags.gymActiveSet(form.gymId), "max");
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
    .select("gym_id, status, name, starts_at, ends_at")
    .eq("id", setId)
    .maybeSingle();
  if (!setRow) return { error: "Set not found." };

  const auth = await requireGymAdmin(setRow.gym_id);
  if ("error" in auth) return { error: auth.error };

  // Validate the RESULTING set, not just the supplied fields: a patch
  // that moves only `startsAt` still has to land on or before the
  // stored `ends_at`. Until 2026-08 this path validated nothing at
  // all, so the client's `<input max={30}>` was the only guard.
  const validation = validateSetPatch({
    ...form,
    startsAt: form.startsAt ?? setRow.starts_at,
    endsAt: form.endsAt ?? setRow.ends_at,
  });
  if (validation) return { error: validation };

  // A set can't go live with no routes — that's an empty Wall, plus a
  // "new set is live" push for nothing. Guard BEFORE applying the flip.
  const goingLive = setRow.status !== "live" && form.status === "live";
  if (goingLive) {
    const { count } = await service
      .from("routes")
      .select("id", { count: "exact", head: true })
      .eq("set_id", setId);
    if (!count || count < 1) {
      return { error: "Add at least one route before publishing this set." };
    }

    // One live set per gym (CLAUDE.md convention, enforced here and in
    // createSet): publishing demotes any other live set first. Abort
    // on failure — two live sets makes getCurrentSet non-deterministic.
    const { error: demoteError } = await auth.supabase
      .from("sets")
      .update({ status: "archived" })
      .eq("gym_id", setRow.gym_id)
      .eq("status", "live")
      .neq("id", setId);
    if (demoteError) return { error: formatError(demoteError) };
  }

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
  if (form.status !== undefined) patch.status = form.status;
  if (form.closingEvent !== undefined) patch.closing_event = form.closingEvent;
  if (form.venueGymId !== undefined) patch.venue_gym_id = form.venueGymId;
  if (form.competitionId !== undefined) patch.competition_id = form.competitionId;

  const { error } = await auth.supabase
    .from("sets")
    .update(patch)
    .eq("id", setId);
  if (error) return { error: formatError(error) };

  // Draft → live transition: broadcast Announcement to every climber
  // with activity at this gym. See CONTEXT.md "Announcement" for the
  // distinction from per-recipient Notifications. announce() dispatch
  // is background + best-effort; the user-id fetch is awaited here so
  // we can size the fan-out + skip the call when no climbers exist.
  if (goingLive) {
    try {
      const [userIds, gym] = await Promise.all([
        getGymClimberUserIds(setRow.gym_id),
        getGym(setRow.gym_id),
      ]);
      announce({
        userIds,
        title: `New set at ${gym?.name ?? "your gym"}`,
        body: `${formatSetLabel({ name: form.name ?? setRow.name, starts_at: form.startsAt ?? setRow.starts_at, ends_at: form.endsAt ?? setRow.ends_at })} is now live. Get climbing.`,
      });
    } catch (err) {
      logger.warn("set_live_announce_preparation_failed", { err: formatErrorForLog(err) });
    }
  }

  revalidateTag(tags.gymActiveSet(setRow.gym_id), "max");
  // Status transitions affect leaderboard semantics for the set.
  revalidateTag(tags.setLeaderboard(setId), "max");
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
