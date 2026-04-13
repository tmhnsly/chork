import { FaChartColumn } from "react-icons/fa6";
import type { GymStats } from "@/lib/data/queries";
import { SectionCard } from "@/components/ui/SectionCard";
import { SetMeta } from "@/components/ui";
import { CountUpNumber } from "@/components/CountUpNumber/CountUpNumber";
import styles from "./gymStatsStrip.module.scss";

interface Props {
  stats: GymStats;
  /** Gym name — rendered alongside the optional reset date. */
  gymName: string;
  /**
   * Reset date for the currently-scoped set. Pass `undefined`/`null`
   * when the view is scoped to all-time so the meta row drops the
   * "Resets …" half and just shows the gym name.
   */
  resetDate?: string | null;
}

/**
 * Headline stats strip for the Chorkboard — climbers, sends, flashes,
 * routes. Wrapped in the shared SectionCard; meta row renders the
 * shared `SetMeta` so the "Resets 20 April · Yonder" pairing matches
 * the profile's Current Set card exactly.
 */
export function GymStatsStrip({ stats, gymName, resetDate }: Props) {
  return (
    <SectionCard
      title="Gym stats"
      icon={<FaChartColumn />}
      meta={<SetMeta resetDate={resetDate} gymName={gymName} />}
    >
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
      <CountUpNumber value={value} className={valueClass} />
      <span className={styles.label}>{label}</span>
    </div>
  );
}
