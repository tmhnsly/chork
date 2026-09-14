"use client";

import Link from "next/link";
import { FaChevronRight, FaArrowUp, FaTrophy, FaMedal, FaRankingStar } from "react-icons/fa6";
import { countOf } from "@/lib/plural";
import type { MyRank } from "@/app/(app)/rank-actions";
import styles from "./rankStrip.module.scss";

interface Props {
  rank: MyRank;
  /**
   * Places gained since this screen opened. Null when nothing has
   * moved — the badge is a reward for something that just happened,
   * not a permanent decoration.
   */
  gained: number | null;
}

/** The tier a placing belongs to; drives the badge's colour and glyph. */
function tierOf(rank: number | null, count: number): "podium" | "top" | "field" | "none" {
  if (rank === null) return "none";
  if (rank <= 3) return "podium";
  if (rank <= Math.max(10, Math.ceil(count * 0.2))) return "top";
  return "field";
}

/**
 * Where you stand, above your card — the page's one glass surface,
 * because it is the one thing on the page that is about you rather
 * than the wall.
 *
 * Two facts, in the order they matter: the placing, and what it
 * would take to move up one. Not the points — the Current Set card
 * beneath already says those, in the same voice. The badge
 * on the left wears the tier (podium gold, top-of-field accent, the
 * rest mono) so the strip reads at a glance before the number does,
 * and the thin bar under the placing is where you sit in the field —
 * full at the top, empty at the bottom.
 *
 * The whole reason Card and Ranks stopped being two nav tabs: the two
 * things are only interesting together. Log a send and the number
 * moves, which is the entire feedback loop the app is built on. The
 * full board is one tap away.
 */
export function RankStrip({ rank, gained }: Props) {
  const unranked = rank.rank === null;
  const tier = tierOf(rank.rank, rank.climberCount);
  // Position in the field as a fraction: #1 of 52 is 1, #52 is 0.
  const field =
    rank.rank === null || rank.climberCount <= 1
      ? 0
      : 1 - (rank.rank - 1) / (rank.climberCount - 1);

  const nextLine =
    rank.rank === 1
      ? "Top of the board"
      : rank.toNext
        ? `${countOf(rank.toNext.points, "pt")} to pass #${rank.toNext.rank}`
        : null;

  return (
    <Link
      href="/leaderboard"
      className={styles.strip}
      data-tier={tier}
      aria-label={
        unranked
          ? "You're not on the board yet. Open the full standings."
          : `Rank ${rank.rank} of ${rank.climberCount}, ${countOf(rank.points, "point")}`
            + (nextLine ? `, ${nextLine}` : "")
            + (gained ? `, up ${countOf(gained, "place")}` : "")
            + ". Open the full standings."
      }
    >
      <span className={styles.badge} aria-hidden>
        {tier === "podium" ? <FaTrophy /> : tier === "top" ? <FaMedal /> : <FaRankingStar />}
      </span>

      <span className={styles.body}>
        {unranked ? (
          <span className={styles.prompt}>Send one route to join the board</span>
        ) : (
          <>
            <span className={styles.rank}>
              <span className={styles.hash}>#</span>
              {rank.rank}
              <span className={styles.of}>of {rank.climberCount}</span>
            </span>
            <span
              className={styles.field}
              style={{ "--fill": field } as React.CSSProperties}
            >
              <span className={styles.fieldFill} />
            </span>
            {nextLine && <span className={styles.next}>{nextLine}</span>}
          </>
        )}
      </span>

      {/* Only while it's news. `key` on the count restarts the
          animation when you climb again without leaving the screen. */}
      {gained !== null && gained > 0 && (
        <span key={gained} className={styles.gained}>
          <FaArrowUp aria-hidden /> {gained}
        </span>
      )}

      <FaChevronRight className={styles.chevron} aria-hidden />
    </Link>
  );
}
