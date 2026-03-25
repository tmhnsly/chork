"use client";

import type { Meta, StoryObj } from "@storybook/nextjs";
import styles from "./climberStats.module.scss";

/* ------------------------------------------------------------------ */
/*  Presentational wrapper for Storybook.                             */
/*  ClimberStats is a server component that fetches its own data,     */
/*  so we recreate the same markup here with pre-computed props.       */
/* ------------------------------------------------------------------ */

interface ClimberStatsDisplayProps {
  /** Label for the current set block, e.g. "APR 7 – MAY 4". Omit when there is no active set. */
  setLabel?: string | null;
  /** Points earned in the current set. */
  currentPoints?: number;
  /** Completed routes in the current set. */
  currentCompletions?: number;
  /** Flash count in the current set. */
  currentFlashes?: number;
  /** All-time completed routes. */
  allTimeCompletions: number;
  /** All-time flash count. */
  allTimeFlashes: number;
}

function ClimberStatsDisplay({
  setLabel = null,
  currentPoints = 0,
  currentCompletions = 0,
  currentFlashes = 0,
  allTimeCompletions,
  allTimeFlashes,
}: ClimberStatsDisplayProps) {
  return (
    <div className={styles.wrapper}>
      {setLabel && (
        <div className={styles.block}>
          <span className={styles.blockLabel}>{setLabel}</span>
          <div className={styles.row}>
            <div className={styles.stat}>
              <span className={styles.value}>{currentPoints}</span>
              <span className={styles.label}>Points</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.value}>{currentCompletions}</span>
              <span className={styles.label}>Sends</span>
            </div>
            <div className={styles.stat}>
              <span className={`${styles.value} ${styles.flashValue}`}>
                {currentFlashes}
              </span>
              <span className={styles.label}>Flashes</span>
            </div>
          </div>
        </div>
      )}

      <div className={styles.row}>
        <span className={styles.allTimeLabel}>All time</span>
        <span className={styles.allTimeStat}>
          {allTimeCompletions} sends
        </span>
        <span className={styles.allTimeStat}>
          {allTimeFlashes} flashes
        </span>
      </div>
    </div>
  );
}

/** Presentational mirror of the server-side ClimberStats component. */
const meta = {
  title: "Components/ClimberStats",
  component: ClimberStatsDisplay,
} satisfies Meta<typeof ClimberStatsDisplay>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Active set with current-set stats and all-time totals. */
export const WithActiveSet: Story = {
  args: {
    setLabel: "APR 7 \u2013 MAY 4",
    currentPoints: 24,
    currentCompletions: 8,
    currentFlashes: 3,
    allTimeCompletions: 45,
    allTimeFlashes: 12,
  },
};

/** No active set — only the all-time row is visible. */
export const NoActiveSet: Story = {
  args: {
    setLabel: null,
    allTimeCompletions: 22,
    allTimeFlashes: 5,
  },
};

/** Brand-new climber with zero activity everywhere. */
export const NewClimber: Story = {
  args: {
    setLabel: null,
    currentPoints: 0,
    currentCompletions: 0,
    currentFlashes: 0,
    allTimeCompletions: 0,
    allTimeFlashes: 0,
  },
};
