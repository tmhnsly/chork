"use client";

import { useState, useCallback } from "react";
import { FaChevronUp, FaChevronDown, FaLocationCrosshairs } from "react-icons/fa6";
import { Button, showToast } from "@/components/ui";
import { LeaderboardList } from "./LeaderboardList";
import { fetchLeaderboardPage } from "@/app/leaderboard/actions";
import type { LeaderboardEntry } from "@/lib/data";
import {
  TOP_LIMIT,
  BROWSE_WINDOW,
  computeInitialOffset,
  computePrevOffset,
  computeNextOffset,
  computeReturnOffset,
} from "./browseSection.helpers";
import styles from "./browseSection.module.scss";

interface Props {
  /** Initial rows from server-side neighbourhood fetch. */
  initialRows: LeaderboardEntry[];
  /** Caller's rank — drives the "return to you" computation. */
  userRank: number;
  /** "set" tab → set id; "all" tab → null. */
  setId: string | null;
  currentUserId: string;
  onPress: (entry: LeaderboardEntry) => void;
}

/**
 * Browse-the-board control. Replaces the prior "see all" + "load more"
 * pagination with a fixed-window navigator: a 5-row view of the board
 * with up / down buttons that flip to the adjacent window, plus a
 * "return to you" jump back to the caller's neighbourhood.
 *
 * The initial window is the server-fetched neighbourhood (5 rows
 * centred on the caller's rank). When the caller is just below the top
 * (rank 6-7), the neighbourhood naturally trims the rows that overlap
 * the top section — pressing the up button fetches the next window
 * upwards, which by design starts at offset 5 (clamped) so the top-5
 * never repeats here.
 *
 * Pure offset arithmetic (initial / prev / next / return-to-you)
 * lives in `browseSection.helpers.ts` so it's testable in isolation.
 *
 * Tab / setId resets are handled by the parent passing a `key` that
 * remounts this component fresh, so we don't need an effect to sync
 * external prop changes into state.
 */
export function BrowseSection({
  initialRows,
  userRank,
  setId,
  currentUserId,
  onPress,
}: Props) {
  // Window state. `offset` is row-based (0-indexed against the full
  // ranked list), so `[offset, offset + BROWSE_WINDOW)` is the slice
  // we're showing. Initial values pulled from props on mount; the
  // parent forces a fresh mount via key prop on tab / setId changes.
  const [rows, setRows] = useState(initialRows);
  const [offset, setOffset] = useState(() => computeInitialOffset(initialRows, userRank));
  const [loading, setLoading] = useState(false);
  // Bottom-of-board check — set after a fetch returns < BROWSE_WINDOW.
  const [atBottom, setAtBottom] = useState(false);

  const atTop = offset <= TOP_LIMIT;

  const loadAt = useCallback(async (nextOffset: number) => {
    setLoading(true);
    const result = await fetchLeaderboardPage(setId, nextOffset, BROWSE_WINDOW);
    setLoading(false);
    if ("error" in result) {
      showToast(result.error, "error");
      return;
    }
    setRows(result.rows);
    setOffset(nextOffset);
    setAtBottom(result.rows.length < BROWSE_WINDOW);
  }, [setId]);

  const goUp = useCallback(() => {
    const next = computePrevOffset(offset);
    if (next === offset) return;
    void loadAt(next);
  }, [offset, loadAt]);

  const goDown = useCallback(() => {
    void loadAt(computeNextOffset(offset));
  }, [offset, loadAt]);

  const returnToYou = useCallback(() => {
    const target = computeReturnOffset(userRank);
    if (target === offset) return;
    void loadAt(target);
  }, [userRank, offset, loadAt]);

  const userInView = rows.some((r) => r.user_id === currentUserId);
  const showReturn = !userInView;

  if (rows.length === 0 && atTop) return null;

  return (
    <section className={styles.section}>
      <div className={styles.controls}>
        <Button
          variant="ghost"
          onClick={goUp}
          disabled={atTop || loading}
          aria-label="Browse up the board"
        >
          <FaChevronUp aria-hidden />
          <span>Up</span>
        </Button>
        {showReturn && (
          <Button
            variant="secondary"
            onClick={returnToYou}
            disabled={loading}
            aria-label="Return to your position"
          >
            <FaLocationCrosshairs aria-hidden />
            <span>Back to you</span>
          </Button>
        )}
        <Button
          variant="ghost"
          onClick={goDown}
          disabled={atBottom || loading}
          aria-label="Browse down the board"
        >
          <span>Down</span>
          <FaChevronDown aria-hidden />
        </Button>
      </div>

      <LeaderboardList
        rows={rows}
        currentUserId={currentUserId}
        onPress={onPress}
        ariaLabel="Browse the board"
      />
    </section>
  );
}
