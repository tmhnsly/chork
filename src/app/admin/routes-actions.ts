"use server";

import { revalidateTag } from "next/cache";
import { requireAdminOfRoute, requireAdminOfSet } from "@/lib/auth";
import {
  quickSetupRoutes,
  setRouteTags,
  updateAdminRoute,
} from "@/lib/data/admin-mutations";
import { UUID_RE } from "@/lib/validation";
import { tags } from "@/lib/cache/tags";

import type { ActionResult } from "@/lib/action-result";

// ────────────────────────────────────────────────────────────────
// Routes
// ────────────────────────────────────────────────────────────────

// Real routes typically carry 0–5 tags (style + difficulty + setter
// vibe). 20 is a generous ceiling that rejects hostile payloads before
// they reach the DB insert path, without constraining realistic use.
const MAX_ROUTE_TAGS = 20;

export async function quickSetupSetRoutes(form: {
  setId: string;
  count: number;
  zoneRouteNumbers: number[];
}): Promise<ActionResult<{ created: number }>> {
  if (!Number.isInteger(form.count) || form.count < 1 || form.count > 100) {
    return { error: "Route count must be between 1 and 100." };
  }
  if (!Array.isArray(form.zoneRouteNumbers)) {
    return { error: "Invalid zone route list." };
  }
  // Cap array size before the filter so a hostile payload with 10k
  // entries doesn't burn CPU just to get reduced to zero. The count
  // bound above is already 100, so any zone list longer than that
  // can't produce a valid row anyway.
  if (form.zoneRouteNumbers.length > form.count) {
    return { error: "Zone route list exceeds route count." };
  }
  const gate = await requireAdminOfSet(form.setId);
  if ("error" in gate) return { error: gate.error };

  const result = await quickSetupRoutes(gate.auth.supabase, {
    setId: form.setId,
    count: form.count,
    zoneRouteNumbers: form.zoneRouteNumbers.filter((n) => Number.isInteger(n) && n > 0 && n <= form.count),
  });
  if ("error" in result) return { error: result.error };

  revalidateTag(tags.setRoutes(form.setId), "max");
  return { success: true, created: result.created };
}

export async function updateRoute(
  routeId: string,
  form: {
    number?: number;
    hasZone?: boolean;
    setterName?: string | null;
  }
): Promise<ActionResult> {
  const gate = await requireAdminOfRoute(routeId);
  if ("error" in gate) return { error: gate.error };

  if (form.number !== undefined && (!Number.isInteger(form.number) || form.number < 1 || form.number > 999)) {
    return { error: "Route number must be between 1 and 999." };
  }
  if (form.setterName !== undefined && form.setterName !== null) {
    const trimmed = form.setterName.trim();
    if (trimmed.length > 80) return { error: "Setter name too long." };
    form.setterName = trimmed || null;
  }

  const result = await updateAdminRoute(gate.auth.supabase, routeId, form);
  if ("error" in result) return { error: result.error };

  revalidateTag(tags.setRoutes(gate.routeRow.set_id), "max");
  revalidateTag(tags.routeGrade(routeId), "max");
  return { success: true };
}

export async function updateRouteTags(
  routeId: string,
  tagIds: string[]
): Promise<ActionResult> {
  const gate = await requireAdminOfRoute(routeId);
  if ("error" in gate) return { error: gate.error };

  if (!Array.isArray(tagIds)) {
    return { error: "Invalid tag list." };
  }
  if (tagIds.length > MAX_ROUTE_TAGS) {
    return { error: `Routes can have at most ${MAX_ROUTE_TAGS} tags.` };
  }
  if (tagIds.some((t) => !UUID_RE.test(t))) {
    return { error: "Invalid tag list." };
  }

  const result = await setRouteTags(gate.auth.supabase, routeId, tagIds);
  if ("error" in result) return { error: result.error };

  revalidateTag(tags.setRoutes(gate.routeRow.set_id), "max");
  return { success: true };
}
