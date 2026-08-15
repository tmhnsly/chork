import Link from "next/link";
import { FaFire, FaArrowRight } from "react-icons/fa6";
import type { ActiveMatchSummary } from "@/lib/data/match-types";
import styles from "./activeMatchBanner.module.scss";
import { countOf } from "@/lib/plural";

interface Props {
  match: ActiveMatchSummary;
}

/**
 * Resume banner at the top of `/match` whenever the signed-in user is
 * a current player of a live match. Acts as the reconnection surface
 * — a user who closes the app mid-match sees this the next time they
 * open Chork.
 */
export function ActiveMatchBanner({ match }: Props) {
  const name = match.name?.trim() || "Untitled match";
  const playerLabel = countOf(match.player_count, "player");

  return (
    <Link
      href={`/match/${match.set_id}`}
      className={styles.banner}
      aria-label={`Resume ${name}`}
    >
      <span className={styles.iconWrap} aria-hidden>
        <FaFire />
      </span>
      <div className={styles.body}>
        <span className={styles.eyebrow}>Live match</span>
        <span className={styles.title}>{name}</span>
        <span className={styles.meta}>
          {match.location ? `${match.location} · ${playerLabel}` : playerLabel}
        </span>
      </div>
      <span className={styles.cta}>
        Resume
        <FaArrowRight aria-hidden />
      </span>
    </Link>
  );
}
