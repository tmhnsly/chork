"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FaEllipsisVertical, FaPlus, FaTag, FaBullseye } from "react-icons/fa6";
import * as Primitive from "@radix-ui/react-dropdown-menu";
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
 * Admin-side route manager for a single set. Two modes in one surface:
 *
 *   Empty set → quick-setup form (number of routes + zone multi-select).
 *   Populated → per-route rows with a context menu (Radix DropdownMenu)
 *   for row-level actions (edit setter, toggle zone, set tags).
 *
 * All mutations route through server actions that re-verify admin
 * membership of the set's gym server-side — never trust the setId or
 * routeId that lands here from the client.
 */
export function RoutesAdmin({ setId, initialRoutes, tags }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [routes, setRoutes] = useState(initialRoutes);

  if (routes.length === 0) {
    return <QuickSetupForm setId={setId} onCreated={(created) => {
      // Optimistic — server actions revalidate, but filling state here
      // avoids an empty flash while the RSC refetch flies.
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
        // Roll back optimistic flip on error.
        setRoutes((prev) =>
          prev.map((r) => (r.id === route.id ? { ...r, has_zone: !next } : r))
        );
        showToast(res.error, "error");
      }
    });
  }

  function handleSetterName(route: AdminRouteRow) {
    const entered = window.prompt(
      "Setter name (internal only — never shown to climbers)",
      route.setter_name ?? ""
    );
    if (entered === null) return;
    const next = entered.trim() || null;
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

  return (
    <section className={styles.section}>
      <ul className={styles.list} aria-label="Routes">
        {routes.map((route) => (
          <li key={route.id} className={styles.row}>
            <span className={styles.number}>{route.number}</span>
            <div className={styles.meta}>
              {route.has_zone && (
                <span className={styles.zone}>
                  <FaBullseye aria-hidden /> Zone
                </span>
              )}
              {route.tag_ids.length > 0 && (
                <span className={styles.tagCount}>
                  <FaTag aria-hidden /> {route.tag_ids.length}
                </span>
              )}
              {route.setter_name && (
                <span className={styles.setter}>{route.setter_name}</span>
              )}
            </div>

            <RouteMenu
              route={route}
              tags={tags}
              onToggleZone={() => handleToggleZone(route)}
              onEditSetter={() => handleSetterName(route)}
              onToggleTag={(tagId) => handleToggleTag(route, tagId)}
            />
          </li>
        ))}
      </ul>
    </section>
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

// ── Per-row context menu ────────────────────────────────────────
function RouteMenu({
  route,
  tags,
  onToggleZone,
  onEditSetter,
  onToggleTag,
}: {
  route: AdminRouteRow;
  tags: RouteTagRow[];
  onToggleZone: () => void;
  onEditSetter: () => void;
  onToggleTag: (tagId: string) => void;
}) {
  return (
    <Primitive.Root>
      <Primitive.Trigger asChild>
        <button type="button" className={styles.menuTrigger} aria-label={`Actions for route ${route.number}`}>
          <FaEllipsisVertical />
        </button>
      </Primitive.Trigger>
      <Primitive.Portal>
        <Primitive.Content className={styles.menuContent} align="end" sideOffset={8}>
          <Primitive.Item className={styles.menuItem} onSelect={onToggleZone}>
            <FaBullseye aria-hidden /> {route.has_zone ? "Remove zone hold" : "Mark zone hold"}
          </Primitive.Item>

          <Primitive.Item className={styles.menuItem} onSelect={onEditSetter}>
            Edit setter name
          </Primitive.Item>

          <Primitive.Separator className={styles.menuSeparator} />

          <Primitive.Sub>
            <Primitive.SubTrigger className={styles.menuItem}>
              <FaTag aria-hidden /> Tags ({route.tag_ids.length})
            </Primitive.SubTrigger>
            <Primitive.Portal>
              <Primitive.SubContent className={styles.menuContent} sideOffset={4}>
                {tags.map((tag) => {
                  const selected = route.tag_ids.includes(tag.id);
                  return (
                    <Primitive.CheckboxItem
                      key={tag.id}
                      className={styles.menuItem}
                      checked={selected}
                      onSelect={(e) => {
                        // Keep the menu open across multiple tag toggles.
                        e.preventDefault();
                        onToggleTag(tag.id);
                      }}
                    >
                      {tag.name}
                      {selected && <span className={styles.menuCheck}>✓</span>}
                    </Primitive.CheckboxItem>
                  );
                })}
              </Primitive.SubContent>
            </Primitive.Portal>
          </Primitive.Sub>
        </Primitive.Content>
      </Primitive.Portal>
    </Primitive.Root>
  );
}
