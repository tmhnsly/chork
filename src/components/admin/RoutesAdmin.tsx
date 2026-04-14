"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FaPlus, FaTag, FaFlag, FaChevronRight } from "react-icons/fa6";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button, showToast } from "@/components/ui";
import {
  quickSetupSetRoutes,
  updateRoute,
  updateRouteTags,
} from "@/app/admin/actions";
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

  function handleToggleZone(route: AdminRouteRow) {
    const next = !route.has_zone;
    setRoutes((prev) =>
      prev.map((r) => (r.id === route.id ? { ...r, has_zone: next } : r))
    );
    startTransition(async () => {
      const res = await updateRoute(route.id, { hasZone: next });
      if ("error" in res) {
        setRoutes((prev) =>
          prev.map((r) => (r.id === route.id ? { ...r, has_zone: !next } : r))
        );
        showToast(res.error, "error");
      }
    });
  }

  function handleSetterName(route: AdminRouteRow, next: string | null) {
    setRoutes((prev) =>
      prev.map((r) => (r.id === route.id ? { ...r, setter_name: next } : r))
    );
    startTransition(async () => {
      const res = await updateRoute(route.id, { setterName: next });
      if ("error" in res) {
        setRoutes((prev) =>
          prev.map((r) => (r.id === route.id ? { ...r, setter_name: route.setter_name } : r))
        );
        showToast(res.error, "error");
      }
    });
  }

  function handleToggleTag(route: AdminRouteRow, tagId: string) {
    const has = route.tag_ids.includes(tagId);
    const nextIds = has ? route.tag_ids.filter((id) => id !== tagId) : [...route.tag_ids, tagId];
    setRoutes((prev) =>
      prev.map((r) => (r.id === route.id ? { ...r, tag_ids: nextIds } : r))
    );
    startTransition(async () => {
      const res = await updateRouteTags(route.id, nextIds);
      if ("error" in res) {
        setRoutes((prev) =>
          prev.map((r) => (r.id === route.id ? { ...r, tag_ids: route.tag_ids } : r))
        );
        showToast(res.error, "error");
      }
    });
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
