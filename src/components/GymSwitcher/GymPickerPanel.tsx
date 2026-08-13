"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useClientResource } from "@/hooks/use-client-resource";
import { Button } from "@/components/ui/Button";
import { FaMagnifyingGlass, FaCheck } from "react-icons/fa6";
import { ConfirmInline, shimmerStyles, showToast } from "@/components/ui";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { switchActiveGym, clearActiveGym } from "@/app/(app)/membership-actions";
import styles from "./gymPickerPanel.module.scss";

import { logger } from "@/lib/logger";
import { formatErrorForLog } from "@/lib/errors";
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
  /**
   * Whether the pane is the settings sheet's active panel. Gates the
   * gym-list fetch so a closed pane costs nothing.
   */
  open: boolean;
  /** Called after a successful switch so the sheet can close. */
  onClose: () => void;
  /** The user's currently active gym id — ticked in the list. */
  activeGymId: string | null;
}

/**
 * Searchable gym picker — a *pane* inside the settings sheet, not a
 * sheet of its own. It used to render its own `BottomSheet`, which
 * stacked a second dialog on top of Settings; the sheet now slides
 * between panes instead, so this component owns only its content.
 *
 * Fetches the full listed-gym catalogue on open (once, cached for the
 * session — the list is small and the `is_listed = true` check is a
 * trivial index hit).
 *
 * Selection fires `switchActiveGym`, which updates
 * `profiles.active_gym_id` and adds a climber membership if needed.
 */
export function GymPickerPanel({ open, onClose, activeGymId }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  // Leaving is reversible — the membership survives — but it does
  // take the wall and board away, so it gets an explicit opt-in
  // rather than firing on the first tap.
  const [confirmingGymless, setConfirmingGymless] = useState(false);

  // Fetch once on first open; the settled result is kept for the
  // session (constant key ⇒ never refetched). Errors degrade to an
  // empty list inside the fetcher, exactly as before.
  const { data: gyms, error, reload } = useClientResource<GymListing[]>(
    "gym-listings",
    async () => {
      const supabase = createBrowserSupabase();
      const { data, error } = await supabase
        .from("gyms")
        .select("id, name, slug, city, country")
        .eq("is_listed", true)
        .order("name");
      if (error) {
        // Throw so useClientResource surfaces a retryable error state
        // rather than a misleading empty "No gyms" list.
        logger.error("gym_listing_failed", { err: formatErrorForLog(error) });
        throw error;
      }
      return data ?? [];
    },
    { enabled: open },
  );

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

  function handleGoGymless() {
    if (activeGymId === null) {
      onClose();
      return;
    }
    setConfirmingGymless(true);
  }

  function confirmGymless() {
    startTransition(async () => {
      const res = await clearActiveGym();
      if ("error" in res) {
        showToast(res.error, "error");
        return;
      }
      showToast("Gym cleared", "success");
      onClose();
      // Push *and* refresh, both needed for different reasons. The
      // push moves them off a page that no longer applies — the Wall
      // and Board bounce gymless climbers to /jam anyway. The refresh
      // busts the client router cache so the layout re-renders: NavBar
      // is a server component, and with `staleTimes.dynamic = 60` a
      // push alone left the gym-variant nav (Wall / Board / Admin) on
      // screen for up to a minute after the gym was gone.
      router.push("/jam");
      router.refresh();
    });
  }

  // Confirm takes over the whole pane rather than sitting above the
  // list. Leaving is a decision about the pane's own subject, so
  // leaving the catalogue tappable underneath would invite a stray
  // tap on a gym while the question is still on screen.
  if (confirmingGymless) {
    return (
      <ConfirmInline
        prompt={
          <>
            Step out of gym mode? The wall and board for your gym will
            disappear until you pick it again. Jams, crews and your
            climbing history all stay exactly as they are.
          </>
        }
        confirmLabel="Step out"
        cancelLabel="Stay"
        confirmVariant="primary"
        pending={pending}
        pendingLabel="Clearing…"
        onConfirm={confirmGymless}
        onCancel={() => setConfirmingGymless(false)}
      />
    );
  }

  return (
    <div className={styles.panel}>
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

        {/* Gymless sits above the catalogue, not buried at the end of
            it: jams-anywhere is the product, and a gym is the optional
            extra. Never filtered out by the search box for the same
            reason. */}
        <button
          type="button"
          className={`${styles.row} ${activeGymId === null ? styles.rowActive : ""}`}
          onClick={handleGoGymless}
          disabled={pending}
        >
          <span className={styles.rowText}>
            <span className={styles.rowName}>Not at a Chork gym</span>
            <span className={styles.rowMeta}>Jams and crews still work</span>
          </span>
          {activeGymId === null && (
            <FaCheck className={styles.activeIcon} aria-label="No active gym" />
          )}
        </button>

        <div className={styles.gymlessDivider} />

        {error ? (
          <div className={styles.empty}>
            Couldn&apos;t load gyms.{" "}
            <Button variant="ghost" onClick={reload}>
              Retry
            </Button>
          </div>
        ) : filtered === null ? (
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
  );
}
