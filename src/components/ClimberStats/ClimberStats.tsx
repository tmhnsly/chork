import type { ReactNode } from "react";
import { FaStar, FaBolt, FaCheck, FaArrowTrendUp } from "react-icons/fa6";
import { BentoGrid, BentoStat } from "@/components/ui";
import styles from "./climberStats.module.scss";

interface SetStats {
  points: number;
  completions: number;
  flashes: number;
}

interface Props {
  currentSet: SetStats | null;
  allTimeCompletions: number;
  allTimeFlashes: number;
  allTimePoints: number;
  /** Optional content rendered below the current set stats (e.g. mini punch card) */
  children?: ReactNode;
}

export function ClimberStats({
  currentSet,
  allTimeCompletions,
  allTimeFlashes,
  allTimePoints,
  children,
}: Props) {
  return (
    <div className={styles.wrapper}>
      <section className={styles.section}>
        <span className={styles.sectionLabel}>Stats</span>
        <BentoGrid columns={3}>
          <BentoStat
            label="Points"
            value={allTimePoints}
            icon={<FaStar />}
            variant="accent"
          />
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

      {currentSet && (
        <section className={styles.section}>
          <span className={styles.sectionLabel}>Current set</span>
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
          {children}
        </section>
      )}
    </div>
  );
}
