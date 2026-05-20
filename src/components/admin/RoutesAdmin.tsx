"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FaPlus, FaTag, FaFlag, FaChevronRight } from "react-icons/fa6";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button, showToast } from "@/components/ui";
import {
  quickSetupSetRoutes,
  updateRoute,
  updateRouteTags,
} from "@/app/admin/routes-actions";
import type { AdminRouteRow, RouteTagRow } from "@/lib/data/admin-queries";
import styles from "./routesAdmin.module.scss";

interface Props {
  setId: string;
  initialRoutes: AdminRouteRow[];
  tags: RouteTagRow[];
}

/**
 * Admin-side route manager for a single set. Two modes:
 *
 *   Empty set → quick-setup form (number of routes + zone multi-select).
 *   Populated → per-route rows that open an edit sheet with every
 *     attribute (zone, setter, tags) visible in one place. Tapping the
 *     whole row rather than a tucked-away 3-dot is the primary UX
 *     choice — the row IS the button.
 *
 * All mutations route through server actions that re-verify admin
 * membership of the set's gym server-side — never trust the setId or
 * routeId that lands here from the client.
 */
export function RoutesAdmin({ setId, initialRoutes, tags }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [routes, setRoutes] = useState(initialRoutes);
  const [editingId, setEditingId] = useState<string | null>(null);
  // Per-route dedup ref so rapid double-toggle doesn't fire two
  // concurrent server calls whose reverts compose incorrectly.
  // Declared before the early-return below so hook-call order stays
  // stable across renders (rules-of-hooks). Mirrors the pattern in
  // useRouteLogState.handleZoneToggle.
  const zoningRef = useRef<Set<string>>(new Set());

  if (routes.length === 0) {
    return <QuickSetupForm setId={setId} onCreated={(created) => {
      const next: AdminRouteRow[] = Array.from({ length: created }, (_, i) => ({
        id: `pending-${i + 1}`,
        number: i + 1,
        has_zone: false,
        setter_name: null,
        tag_ids: [],
      }));
      setRoutes(next);
      router.refresh();
    }} pending={pending} startTransition={startTransition} />;
  }

  // Local optimistic-patch helper. The three handlers below all follow
  // the same shape: patch one route in the list, fire the server
  // action, revert the patch + toast the error if the action fails.
  // Kept inline (not promoted to a hook) because the pattern only
  // repeats in this one component — the deletion test for a global
  // hook fails, and the ceremony of passing patch / revert / action
  // through a generic signature is heavier than the saved lines.
  function patchOptimistically(
    id: string,
    patch: Partial<AdminRouteRow>,
    revert: Partial<AdminRouteRow>,
    action: () => Promise<{ error: string } | { success: true }>,
  ): Promise<void> {
    setRoutes((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...patch } : r))
    );
    return new Promise((resolve) => {
      startTransition(async () => {
        const res = await action();
        if ("error" in res) {
          setRoutes((prev) =>
            prev.map((r) => (r.id === id ? { ...r, ...revert } : r))
          );
          showToast(res.error, "error");
        }
        resolve();
      });
    });
  }

  function handleToggleZone(route: AdminRouteRow) {
    if (zoningRef.current.has(route.id)) return;
    zoningRef.current.add(route.id);
    const original = route.has_zone;
    void patchOptimistically(
      route.id,
      { has_zone: !original },
      { has_zone: original },
      () => updateRoute(route.id, { hasZone: !original }),
    ).finally(() => zoningRef.current.delete(route.id));
  }

  function handleSetterName(route: AdminRouteRow, next: string | null) {
    void patchOptimistically(
      route.id,
      { setter_name: next },
      { setter_name: route.setter_name },
      () => updateRoute(route.id, { setterName: next }),
    );
  }

  function handleToggleTag(route: AdminRouteRow, tagId: string) {
    const has = route.tag_ids.includes(tagId);
    const nextIds = has
      ? route.tag_ids.filter((id) => id !== tagId)
      : [...route.tag_ids, tagId];
    void patchOptimistically(
      route.id,
      { tag_ids: nextIds },
      { tag_ids: route.tag_ids },
      () => updateRouteTags(route.id, nextIds),
    );
  }

  const editingRoute = routes.find((r) => r.id === editingId) ?? null;

  return (
    <section className={styles.section}>
      <ul className={styles.list} aria-label="Routes">
        {routes.map((route) => (
          <li key={route.id}>
            <button
              type="button"
              className={styles.row}
              onClick={() => setEditingId(route.id)}
              aria-label={`Edit route ${route.number}`}
            >
              <span className={styles.number}>{route.number}</span>
              <span className={styles.meta}>
                {route.has_zone && (
                  <span className={styles.badgeZone}>
                    <FaFlag aria-hidden /> Zone
                  </span>
                )}
                {route.tag_ids.length > 0 && (
                  <span className={styles.badgeTags}>
                    <FaTag aria-hidden /> {route.tag_ids.length}
                  </span>
                )}
                {route.setter_name && (
                  <span className={styles.setter}>{route.setter_name}</span>
                )}
              </span>
              <FaChevronRight className={styles.chevron} aria-hidden />
            </button>
          </li>
        ))}
      </ul>

      {editingRoute && (
        <RouteEditSheet
          route={editingRoute}
          tags={tags}
          onClose={() => setEditingId(null)}
          onToggleZone={() => handleToggleZone(editingRoute)}
          onSetterName={(next) => handleSetterName(editingRoute, next)}
          onToggleTag={(tagId) => handleToggleTag(editingRoute, tagId)}
        />
      )}
    </section>
  );
}

// ── Edit sheet — every route attribute in one place ────────────
function RouteEditSheet({
  route,
  tags,
  onClose,
  onToggleZone,
  onSetterName,
  onToggleTag,
}: {
  route: AdminRouteRow;
  tags: RouteTagRow[];
  onClose: () => void;
  onToggleZone: () => void;
  onSetterName: (next: string | null) => void;
  onToggleTag: (tagId: string) => void;
}) {
  const [setterDraft, setSetterDraft] = useState(route.setter_name ?? "");

  function commitSetter() {
    const trimmed = setterDraft.trim();
    const next = trimmed.length > 0 ? trimmed : null;
    if (next === (route.setter_name ?? null)) return;
    onSetterName(next);
  }

  return (
    <BottomSheet
      open
      onClose={onClose}
      title={`Route ${route.number}`}
      description="Edit zone, setter, and tags"
    >
      <div className={styles.sheetBody}>
        <label className={styles.toggleRow}>
          <span className={styles.toggleLabel}>
            <FaFlag aria-hidden className={styles.toggleIcon} /> Zone hold
          </span>
          <input
            type="checkbox"
            className={styles.switch}
            checked={route.has_zone}
            onChange={onToggleZone}
          />
        </label>

        <label className={styles.fieldRow}>
          <span className={styles.fieldLabel}>Setter</span>
          <input
            type="text"
            className={styles.fieldInput}
            value={setterDraft}
            onChange={(e) => setSetterDraft(e.target.value)}
            onBlur={commitSetter}
            placeholder="Internal only"
            maxLength={40}
          />
        </label>

        <div className={styles.tagsBlock}>
          <span className={styles.fieldLabel}>Tags</span>
          {tags.length === 0 ? (
            <p className={styles.emptyTags}>No tags defined for this gym yet.</p>
          ) : (
            <div className={styles.tagGrid}>
              {tags.map((tag) => {
                const selected = route.tag_ids.includes(tag.id);
                return (
                  <label
                    key={tag.id}
                    className={`${styles.tagChip} ${selected ? styles.tagChipActive : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => onToggleTag(tag.id)}
                      className={styles.visuallyHidden}
                    />
                    {tag.name}
                  </label>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </BottomSheet>
  );
}

// ── Quick-setup form (empty state) ──────────────────────────────
function QuickSetupForm({
  setId,
  onCreated,
  pending,
  startTransition,
}: {
  setId: string;
  onCreated: (created: number) => void;
  pending: boolean;
  startTransition: React.TransitionStartFunction;
}) {
  const [count, setCount] = useState(14);
  const [zones, setZones] = useState<Set<number>>(new Set());

  function toggle(n: number) {
    setZones((prev) => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await quickSetupSetRoutes({
        setId,
        count,
        zoneRouteNumbers: [...zones],
      });
      if ("error" in res) {
        showToast(res.error, "error");
        return;
      }
      showToast(`Created ${res.created} routes`, "success");
      onCreated(res.created);
    });
  }

  return (
    <form className={styles.quickSetup} onSubmit={handleSubmit}>
      <label className={styles.quickSetupField}>
        <span className={styles.quickSetupLabel}>How many routes?</span>
        <input
          type="number"
          className={styles.quickSetupInput}
          value={count}
          min={1}
          max={100}
          onChange={(e) => setCount(Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
        />
      </label>

      <fieldset className={styles.zoneFieldset}>
        <legend className={styles.quickSetupLabel}>Zone-hold routes</legend>
        <div className={styles.zoneGrid}>
          {Array.from({ length: count }, (_, i) => i + 1).map((n) => (
            <label
              key={n}
              className={`${styles.zoneChip} ${zones.has(n) ? styles.zoneChipActive : ""}`}
            >
              <input
                type="checkbox"
                checked={zones.has(n)}
                onChange={() => toggle(n)}
                className={styles.visuallyHidden}
              />
              {n}
            </label>
          ))}
        </div>
      </fieldset>

      <Button type="submit" disabled={pending} fullWidth>
        {pending ? "Creating…" : <><FaPlus aria-hidden /> Create {count} routes</>}
      </Button>
    </form>
  );
}
