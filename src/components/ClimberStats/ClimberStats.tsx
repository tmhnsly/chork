import { FaStar, FaBolt, FaCheck, FaArrowTrendUp } from "react-icons/fa6";
import { BentoGrid, BentoStat } from "@/components/ui";
import styles from "./climberStats.module.scss";

interface SetStats {
  label: string;
  points: number;
  completions: number;
  flashes: number;
}

interface Props {
  currentSet: SetStats | null;
  allTimeCompletions: number;
  allTimeFlashes: number;
}

export function ClimberStats({ currentSet, allTimeCompletions, allTimeFlashes }: Props) {
  return (
    <div className={styles.wrapper}>
      {currentSet && (
        <section className={styles.section}>
          <span className={styles.sectionLabel}>{currentSet.label}</span>
          <BentoGrid columns={3}>
            <BentoStat
              label="Points"
              value={currentSet.points}
              icon={<FaStar />}
              variant="accent"
            />
            <BentoStat
              label="Sends"
              value={currentSet.completions}
              icon={<FaCheck />}
            />
            <BentoStat
              label="Flashes"
              value={currentSet.flashes}
              icon={<FaBolt />}
              variant="flash"
            />
          </BentoGrid>
        </section>
      )}

      <section className={styles.section}>
        <span className={styles.sectionLabel}>All time</span>
        <BentoGrid columns={2}>
          <BentoStat
            label="Sends"
            value={allTimeCompletions}
            icon={<FaArrowTrendUp />}
          />
          <BentoStat
            label="Flashes"
            value={allTimeFlashes}
            icon={<FaBolt />}
            variant="flash"
          />
        </BentoGrid>
      </section>
    </div>
  );
}
