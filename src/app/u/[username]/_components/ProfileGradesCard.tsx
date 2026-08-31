"use client";

import { useState } from "react";
import { SegmentedControl, GradePyramid } from "@/components/ui";
import { GradeProgressionChart } from "@/components/ui/GradeProgressionChart/GradeProgressionChart";
import type { GradePyramid as Pyramid } from "@/lib/data/grade-distribution";
import type { GradeProgression } from "@/lib/data/grade-progression";
import styles from "./profileGradesSection.module.scss";

type View = "pyramid" | "trend";

interface Props {
  pyramids: Pyramid[];
  charts: GradeProgression[];
  ungradedSends: number;
}

/**
 * The Grades card's body: the pyramids, and behind a segmented toggle
 * the same sends as a progression — best grade per month. A
 * SegmentedControl because switching what you're LOOKING AT is a
 * filter, not a choice of what to do (see "the tile is the app's
 * vocabulary"). The toggle only appears when there's a trend to show.
 */
export function ProfileGradesCard({ pyramids, charts, ungradedSends }: Props) {
  const [view, setView] = useState<View>("pyramid");
  const showToggle = charts.length > 0;

  return (
    <>
      {showToggle && (
        <SegmentedControl<View>
          options={[
            { value: "pyramid", label: "Pyramid" },
            { value: "trend", label: "Over time" },
          ]}
          value={view}
          onChange={setView}
          ariaLabel="Grades view"
        />
      )}

      {view === "pyramid" || !showToggle ? (
        <div className={styles.pyramids}>
          {pyramids.map((pyramid) => (
            <GradePyramid
              key={`${pyramid.discipline}-${pyramid.scale}`}
              pyramid={pyramid}
            />
          ))}
        </div>
      ) : (
        <div className={styles.pyramids}>
          {charts.map((chart) => (
            <GradeProgressionChart
              key={`${chart.discipline}-${chart.scale}`}
              chart={chart}
            />
          ))}
        </div>
      )}

      {ungradedSends > 0 && (
        /* Say what was left out. A climber who has sent 30 routes and
           sees 22 on the pyramid will otherwise assume it's broken. */
        <p className={styles.footnote}>
          {ungradedSends} {ungradedSends === 1 ? "send isn't" : "sends aren't"}{" "}
          shown — they were on a points-only or custom scale, which has no
          comparable grade.
        </p>
      )}
    </>
  );
}
