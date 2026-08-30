"use server";

import { revalidateTag } from "next/cache";
import { requireAdminOfRoute, requireAdminOfSet } from "@/lib/auth";
import { formatError } from "@/lib/errors";
import { UUID_RE } from "@/lib/validation";
import { tags } from "@/lib/cache/tags";
import type { Database } from "@/lib/database.types";

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
  const gate = await requireAdminOfSet(form.setId, { rateLimit: "mutationsWrite" });
  if ("error" in gate) return { error: gate.error };

  // Idempotent on re-run — existing (set_id, number) rows are
  // untouched thanks to the unique constraint on routes(set_id,
  // number) + upsert onConflict. Zone flags are re-applied on every
  // call so admins can quickly correct a miscount.
  const zoneSet = new Set(
    form.zoneRouteNumbers.filter(
      (n) => Number.isInteger(n) && n > 0 && n <= form.count,
    ),
  );
  const rows = Array.from({ length: form.count }, (_, i) => ({
    set_id: form.setId,
    number: i + 1,
    has_zone: zoneSet.has(i + 1),
  }));

  const { error, count } = await gate.auth.supabase
    .from("routes")
    .upsert(rows, { onConflict: "set_id,number", count: "exact" });
  if (error) return { error: formatError(error) };

  revalidateTag(tags.setRoutes(form.setId), "max");
  return { success: true, created: count ?? rows.length };
}

export async function updateRoute(
  routeId: string,
  form: {
    number?: number;
    hasZone?: boolean;
    setterName?: string | null;
  }
): Promise<ActionResult> {
  const gate = await requireAdminOfRoute(routeId, { rateLimit: "mutationsWrite" });
  if ("error" in gate) return { error: gate.error };

  if (form.number !== undefined && (!Number.isInteger(form.number) || form.number < 1 || form.number > 999)) {
    return { error: "Route number must be between 1 and 999." };
  }
  if (form.setterName !== undefined && form.setterName !== null) {
    const trimmed = form.setterName.trim();
    if (trimmed.length > 80) return { error: "Setter name too long." };
    form.setterName = trimmed || null;
  }

  type RouteUpdate = Database["public"]["Tables"]["routes"]["Update"];
  const patch: RouteUpdate = {};
  if (form.number !== undefined) patch.number = form.number;
  if (form.hasZone !== undefined) patch.has_zone = form.hasZone;
  if (form.setterName !== undefined) patch.setter_name = form.setterName;

  const { error } = await gate.auth.supabase
    .from("routes")
    .update(patch)
    .eq("id", routeId);
  if (error) return { error: formatError(error) };

  revalidateTag(tags.setRoutes(gate.routeRow.set_id), "max");
  revalidateTag(tags.routeGrade(routeId), "max");
  return { success: true };
}

export async function updateRouteTags(
  routeId: string,
  tagIds: string[]
): Promise<ActionResult> {
  const gate = await requireAdminOfRoute(routeId, { rateLimit: "mutationsWrite" });
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

  // set_route_tags_tx (migration 060): read + delete + insert happen
  // in one transaction with a FOR UPDATE lock on the route, and the
  // RPC re-checks is_admin_of_route via SECURITY DEFINER — the DB
  // refuses an unauthorised tag overwrite even without the app gate.
  const { error } = await gate.auth.supabase.rpc("set_route_tags_tx", {
    p_route_id: routeId,
    p_tag_ids: tagIds,
  });
  if (error) return { error: formatError(error) };

  revalidateTag(tags.setRoutes(gate.routeRow.set_id), "max");
  return { success: true };
}
