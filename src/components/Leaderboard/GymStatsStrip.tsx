import { FaChartColumn } from "react-icons/fa6";
import type { GymStats } from "@/lib/data/queries";
import { SectionCard } from "@/components/ui/SectionCard";
import styles from "./gymStatsStrip.module.scss";

interface Props {
  stats: GymStats;
  /** Gym name — rendered in the top-right of the card as context. */
  gymName: string;
}

/**
 * Headline stats strip for the Chorkboard — climbers, sends, flashes,
 * routes. Wrapped in the shared SectionCard; the card's title reads
 * "Gym stats" with the gym name in the right-hand meta slot so the
 * hierarchy matches every other stat card in the app.
 */
export function GymStatsStrip({ stats, gymName }: Props) {
  return (
    <SectionCard title="Gym stats" icon={<FaChartColumn />} meta={gymName}>
      <div className={styles.strip} aria-label="Gym stats">
        <Stat
          label={stats.climberCount === 1 ? "Climber" : "Climbers"}
          value={stats.climberCount}
        />
        <Stat
          label={stats.totalSends === 1 ? "Send" : "Sends"}
          value={stats.totalSends}
          accent="accent"
        />
        <Stat
          label={stats.totalFlashes === 1 ? "Flash" : "Flashes"}
          value={stats.totalFlashes}
          accent="flash"
        />
        <Stat
          label={stats.totalRoutes === 1 ? "Route" : "Routes"}
          value={stats.totalRoutes}
        />
      </div>
    </SectionCard>
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
