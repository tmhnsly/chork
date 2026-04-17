import Link from "next/link";
import { FaFire, FaArrowRight } from "react-icons/fa6";
import type { ActiveJamSummary } from "@/lib/data/jam-types";
import styles from "./activeJamBanner.module.scss";

interface Props {
  jam: ActiveJamSummary;
}

/**
 * Resume banner at the top of `/jam` whenever the signed-in user is
 * a current player of a live jam. Acts as the reconnection surface
 * — a user who closes the app mid-jam sees this the next time they
 * open Chork.
 */
export function ActiveJamBanner({ jam }: Props) {
  const name = jam.name?.trim() || "Untitled jam";
  const playerLabel =
    jam.player_count === 1 ? "1 player" : `${jam.player_count} players`;

  return (
    <Link
      href={`/jam/${jam.jam_id}`}
      className={styles.banner}
      aria-label={`Resume ${name}`}
    >
      <span className={styles.iconWrap} aria-hidden>
        <FaFire />
      </span>
      <div className={styles.body}>
        <span className={styles.eyebrow}>Live jam</span>
        <span className={styles.title}>{name}</span>
        <span className={styles.meta}>
          {jam.location ? `${jam.location} · ${playerLabel}` : playerLabel}
        </span>
      </div>
      <span className={styles.cta}>
        Resume
        <FaArrowRight aria-hidden />
      </span>
    </Link>
  );
}
