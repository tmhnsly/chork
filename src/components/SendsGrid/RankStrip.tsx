"use client";

import Link from "next/link";
import { FaChevronRight, FaArrowUp } from "react-icons/fa6";
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

/**
 * Where you stand, above your card.
 *
 * The whole reason Card and Ranks stopped being two nav tabs: the two
 * things are only interesting together. Behind a tab you log a send
 * and see nothing change; here you log a send and the number moves,
 * which is the entire feedback loop the app is built on.
 *
 * Deliberately one line. It is not a leaderboard — it is the answer to
 * "did that matter", and the full board is one tap away for when the
 * answer is "yes, tell me more".
 */
export function RankStrip({ rank, gained }: Props) {
  const unranked = rank.rank === null;

  return (
    <Link
      href="/leaderboard"
      className={styles.strip}
      aria-label={
        unranked
          ? "You're not on the board yet. Open the full standings."
          : `Rank ${rank.rank} of ${rank.climberCount}, ${countOf(rank.points, "point")}`
            + (gained ? `, up ${countOf(gained, "place")}` : "")
            + ". Open the full standings."
      }
    >
      <span className={styles.body}>
        {unranked ? (
          <span className={styles.prompt}>
            Send one route to join the board
          </span>
        ) : (
          <>
            <span className={styles.rank}>
              <span className={styles.hash}>#</span>
              {rank.rank}
            </span>
            <span className={styles.of}>of {rank.climberCount}</span>
            <span className={styles.dot} aria-hidden>
              ·
            </span>
            <span className={styles.points}>
              {countOf(rank.points, "pt")}
            </span>
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
