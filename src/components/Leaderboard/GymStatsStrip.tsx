import type { GymStats } from "@/lib/data/queries";
import styles from "./gymStatsStrip.module.scss";

interface Props {
  stats: GymStats;
}

/**
 * Four-up headline stats strip — climbers, sends, flashes, routes.
 * Rendered between the Chorkboard header and the podium so climbers land
 * on a populated page even before they scroll to the ranks.
 */
export function GymStatsStrip({ stats }: Props) {
  return (
    <section className={styles.strip} aria-label="Gym stats">
      <Stat label="Climbers" value={stats.climberCount} />
      <Stat label="Sends" value={stats.totalSends} accent="accent" />
      <Stat label="Flashes" value={stats.totalFlashes} accent="flash" />
      <Stat label="Routes" value={stats.totalRoutes} />
    </section>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: "accent" | "flash";
}) {
  const valueClass = [
    styles.value,
    accent === "accent" ? styles.valueAccent : "",
    accent === "flash" ? styles.valueFlash : "",
  ].filter(Boolean).join(" ");
  return (
    <div className={styles.cell}>
      <span className={valueClass}>{value}</span>
      <span className={styles.label}>{label}</span>
    </div>
  );
}
