import { LeaderboardList } from "./LeaderboardList";
import type { LeaderboardEntry } from "@/lib/data";
import styles from "./neighbourhoodSection.module.scss";

interface Props {
  rows: LeaderboardEntry[];
  currentUserId: string;
}

export function NeighbourhoodSection({ rows, currentUserId }: Props) {
  return (
    <section className={styles.section}>
      <h2 className={styles.heading}>Your neighbourhood</h2>
      <LeaderboardList
        rows={rows}
        currentUserId={currentUserId}
        ariaLabel="Climbers near your rank"
      />
    </section>
  );
}
