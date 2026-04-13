"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FaMagnifyingGlass, FaCheck } from "react-icons/fa6";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { shimmerStyles, showToast } from "@/components/ui";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { switchActiveGym } from "@/app/(app)/actions";
import styles from "./gymSwitcherSheet.module.scss";

/**
 * Shape of a listed gym row. Mirrors `GymListing` in lib/data/queries,
 * declared locally because this is a client component and the queries
 * module is marked `server-only`.
 */
interface GymListing {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  country: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** The user's currently active gym id — ticked in the list. */
  activeGymId: string | null;
}

/**
 * Searchable gym picker. Fetches the full listed-gym catalogue on open
 * (once, cached for the session — the list is small enough and the
 * RLS check on `is_listed = true` is a trivial index hit).
 *
 * Selection fires the `switchActiveGym` server action which updates
 * `profiles.active_gym_id` and adds a climber membership if needed.
 */
export function GymSwitcherSheet({ open, onClose, activeGymId }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [gyms, setGyms] = useState<GymListing[] | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open || gyms !== null) return;
    let cancelled = false;
    (async () => {
      const supabase = createBrowserSupabase();
      const { data, error } = await supabase
        .from("gyms")
        .select("id, name, slug, city, country")
        .eq("is_listed", true)
        .order("name");
      if (cancelled) return;
      if (error) {
        console.warn("[chork] gym listing failed:", error);
        setGyms([]);
        return;
      }
      setGyms(data ?? []);
    })();
    return () => { cancelled = true; };
  }, [open, gyms]);

  const filtered = useMemo(() => {
    if (!gyms) return null;
    const q = query.trim().toLowerCase();
    if (!q) return gyms;
    return gyms.filter((g) => {
      const hay = [g.name, g.city, g.country].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [gyms, query]);

  function handleSelect(gymId: string) {
    if (gymId === activeGymId) {
      onClose();
      return;
    }
    startTransition(async () => {
      const res = await switchActiveGym(gymId);
      if ("error" in res) {
        showToast(res.error, "error");
        return;
      }
      showToast("Switched gym", "success");
      onClose();
      router.refresh();
    });
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Change gym" description="Pick the gym you're climbing at today">
      <div className={styles.body}>
        <div className={styles.searchWrap}>
          <FaMagnifyingGlass className={styles.searchIcon} aria-hidden />
          <input
            type="search"
            className={styles.search}
            placeholder="Search by name or city"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
        </div>

        {filtered === null ? (
          <ul className={styles.list} aria-busy="true">
            {[0, 1, 2, 3].map((i) => (
              <li key={i} className={`${styles.row} ${shimmerStyles.skeleton}`} />
            ))}
          </ul>
        ) : filtered.length === 0 ? (
          <p className={styles.empty}>No gyms match &quot;{query}&quot;.</p>
        ) : (
          <ul className={styles.list}>
            {filtered.map((gym) => {
              const isActive = gym.id === activeGymId;
              return (
                <li key={gym.id}>
                  <button
                    type="button"
                    className={`${styles.row} ${isActive ? styles.rowActive : ""}`}
                    onClick={() => handleSelect(gym.id)}
                    disabled={pending}
                  >
                    <span className={styles.rowText}>
                      <span className={styles.rowName}>{gym.name}</span>
                      {(gym.city || gym.country) && (
                        <span className={styles.rowMeta}>
                          {[gym.city, gym.country].filter(Boolean).join(", ")}
                        </span>
                      )}
                    </span>
                    {isActive && <FaCheck className={styles.activeIcon} aria-label="Active gym" />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </BottomSheet>
  );
}
