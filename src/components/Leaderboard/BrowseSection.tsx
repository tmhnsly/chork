"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FaChevronUp, FaChevronDown } from "react-icons/fa6";
import { showToast } from "@/components/ui";
import { LeaderboardList } from "./LeaderboardList";
import { fetchLeaderboardPage } from "@/app/leaderboard/actions";
import type { LeaderboardEntry } from "@/lib/data";
import {
  TOP_LIMIT,
  BROWSE_WINDOW,
  PREFETCH_BUFFER,
  computeInitialOffset,
  firstMissingRange,
  seedCache,
  type RowCache,
} from "./browseSection.helpers";
import styles from "./browseSection.module.scss";

interface Props {
  /** Initial rows from server-side neighbourhood fetch. */
  initialRows: LeaderboardEntry[];
  /** Caller's rank — drives the initial window centre. */
  userRank: number;
  /** "set" tab → set id; "all" tab → null. */
  setId: string | null;
  currentUserId: string;
  onPress: (entry: LeaderboardEntry) => void;
}

/**
 * Browse-the-board control. Shows a fixed 5-row window of the
 * leaderboard with an Up button above and a Down button below.
 * Each press nudges the window by a single rank.
 *
 * Rows are cached by absolute offset (= rank − 1) in a plain object.
 * On every window change we:
 *   1. Ensure the visible 5 rows are loaded (blocking the visible
 *      spinner only when the view isn't already fully cached).
 *   2. Prefetch a `PREFETCH_BUFFER`-row buffer above and below in
 *      the background so subsequent nudges are instant.
 * The board's end is discovered when a fetch returns fewer rows
 * than requested; that offset becomes the hard bottom bound and
 * disables the Down button.
 */
export function BrowseSection({
  initialRows,
  userRank,
  setId,
  currentUserId,
  onPress,
}: Props) {
  const [cache, setCache] = useState<RowCache>(() => seedCache(initialRows));
  const [topOffset, setTopOffset] = useState(() =>
    computeInitialOffset(initialRows, userRank),
  );
  const [maxKnownOffset, setMaxKnownOffset] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  // Dedupe concurrent fetches for the same offset+limit pair. Keys
  // live for the duration of a single fetch and get cleared on
  // settle. Prevents the prefetch logic from spamming the server
  // when a nudge happens faster than the previous fetch returns.
  const inFlight = useRef<Set<string>>(new Set());
  // Track unmount so we don't setState after the component is gone
  // (tab switch remounts this via the parent's key prop).
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const fetchRange = useCallback(
    async (start: number, count: number, { silent = false } = {}) => {
      if (count <= 0) return;
      if (maxKnownOffset !== null && start > maxKnownOffset) return;
      const key = `${start}:${count}`;
      if (inFlight.current.has(key)) return;
      inFlight.current.add(key);
      try {
        if (!silent) setLoading(true);
        const result = await fetchLeaderboardPage(setId, start, count);
        if (!mountedRef.current) return;
        if ("error" in result) {
          if (!silent) showToast(result.error, "error");
          return;
        }
        setCache((prev) => {
          const next = { ...prev };
          result.rows.forEach((row, i) => {
            next[start + i] = row;
          });
          return next;
        });
        if (result.rows.length < count) {
          const lastLoaded = start + result.rows.length - 1;
          setMaxKnownOffset((prev) =>
            prev === null ? lastLoaded : Math.min(prev, lastLoaded),
          );
        }
      } finally {
        inFlight.current.delete(key);
        if (!silent && mountedRef.current) setLoading(false);
      }
    },
    [setId, maxKnownOffset],
  );

  // Ensure the visible window is loaded, then prefetch above + below
  // so the next nudge is instant.
  useEffect(() => {
    const viewEnd = topOffset + BROWSE_WINDOW;
    const missingInView = firstMissingRange(cache, topOffset, viewEnd);
    if (missingInView) {
      void fetchRange(missingInView.start, missingInView.count);
    }
    // Prefetch above.
    const prefetchTop = Math.max(TOP_LIMIT, topOffset - PREFETCH_BUFFER);
    const missingAbove = firstMissingRange(cache, prefetchTop, topOffset);
    if (missingAbove) {
      void fetchRange(missingAbove.start, missingAbove.count, { silent: true });
    }
    // Prefetch below.
    const missingBelow = firstMissingRange(
      cache,
      viewEnd,
      viewEnd + PREFETCH_BUFFER,
    );
    if (missingBelow) {
      void fetchRange(missingBelow.start, missingBelow.count, { silent: true });
    }
  }, [topOffset, cache, fetchRange]);

  const visibleRows = useMemo(() => {
    const rows: LeaderboardEntry[] = [];
    for (let i = topOffset; i < topOffset + BROWSE_WINDOW; i++) {
      const row = cache[i];
      if (row) rows.push(row);
    }
    return rows;
  }, [cache, topOffset]);

  const atTop = topOffset <= TOP_LIMIT;
  const atBottom =
    maxKnownOffset !== null && topOffset + BROWSE_WINDOW - 1 >= maxKnownOffset;

  const goUp = useCallback(() => {
    if (atTop) return;
    setTopOffset((o) => Math.max(TOP_LIMIT, o - 1));
  }, [atTop]);

  const goDown = useCallback(() => {
    if (atBottom) return;
    setTopOffset((o) => o + 1);
  }, [atBottom]);

  // Nothing to show and we already know we're at the top → parent
  // will render something else (empty state).
  if (visibleRows.length === 0 && atTop && !loading) return null;

  return (
    <section className={styles.section} aria-label="Browse the board">
      <button
        type="button"
        className={styles.nudge}
        onClick={goUp}
        disabled={atTop || loading}
        aria-label="Nudge up one position"
      >
        <FaChevronUp aria-hidden />
      </button>

      <LeaderboardList
        rows={visibleRows}
        currentUserId={currentUserId}
        onPress={onPress}
        ariaLabel="Board window"
      />

      <button
        type="button"
        className={styles.nudge}
        onClick={goDown}
        disabled={atBottom || loading}
        aria-label="Nudge down one position"
      >
        <FaChevronDown aria-hidden />
      </button>
    </section>
  );
}

