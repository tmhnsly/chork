"use server";

import { revalidateTag } from "next/cache";
import { requireGymAdmin } from "@/lib/auth";
import { createAdminSet, updateAdminSet } from "@/lib/data/admin-mutations";
import { createServiceClient } from "@/lib/supabase/server";
import { formatErrorForLog } from "@/lib/errors";
import { UUID_RE } from "@/lib/validation";
import { getGym } from "@/lib/data/gym-queries";
import { formatSetLabel } from "@/lib/data/set-label";
import { getGymClimberUserIds, sendPushInBackground } from "@/lib/push/server";
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
}

function validateSetInput(form: SetFormInput): string | null {
  if (!UUID_RE.test(form.gymId)) return "Invalid gym.";
  if (!form.startsAt || !form.endsAt) return "Start and end dates are required.";
  if (new Date(form.startsAt) > new Date(form.endsAt)) {
    return "End date must be on or after the start date.";
  }
  if (!["v", "font", "points"].includes(form.gradingScale)) {
    return "Invalid grading scale.";
  }
  if (!Number.isInteger(form.maxGrade) || form.maxGrade < 0 || form.maxGrade > 30) {
    return "Max grade must be between 0 and 30.";
  }
  if (!["draft", "live", "archived"].includes(form.status)) return "Invalid status.";
  return null;
}

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

  const auth = await requireGymAdmin(form.gymId);
  if ("error" in auth) return { error: auth.error };

  const result = await createAdminSet(auth.supabase, {
    gymId: form.gymId,
    name: form.name.trim() || null,
    startsAt: form.startsAt,
    endsAt: form.endsAt,
    gradingScale: form.gradingScale,
    maxGrade: form.maxGrade,
    status: createStatus,
    closingEvent: !!form.closingEvent,
    venueGymId: form.venueGymId ?? null,
    competitionId: form.competitionId ?? null,
  });
  if ("error" in result) return { error: result.error };

  revalidateTag(tags.gymActiveSet(form.gymId), "max");
  return { success: true, setId: result.setId };
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

  const result = await updateAdminSet(auth.supabase, setId, {
    name: form.name?.trim() || null,
    startsAt: form.startsAt,
    endsAt: form.endsAt,
    gradingScale: form.gradingScale,
    maxGrade: form.maxGrade,
    status: form.status,
    closingEvent: form.closingEvent,
    venueGymId: form.venueGymId,
    competitionId: form.competitionId,
  });
  if ("error" in result) return { error: result.error };

  // Draft → live transition: notify every climber who has logged at
  // this gym. Fan-out can be hundreds of endpoints — dispatch
  // *after* the response is sent so the admin's publish click
  // returns immediately instead of waiting on web-push round-trips.
  if (setRow.status !== "live" && form.status === "live") {
    try {
      const [userIds, gym] = await Promise.all([
        getGymClimberUserIds(setRow.gym_id),
        getGym(setRow.gym_id),
      ]);
      if (userIds.length > 0) {
        sendPushInBackground(userIds, {
          title: `New set at ${gym?.name ?? "your gym"}`,
          body: `${formatSetLabel({ name: form.name ?? setRow.name, starts_at: form.startsAt ?? setRow.starts_at, ends_at: form.endsAt ?? setRow.ends_at })} is now live. Get climbing.`,
          url: "/",
        });
      }
    } catch (err) {
      logger.warn("set_live_push_preparation_failed", { err: formatErrorForLog(err) });
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
