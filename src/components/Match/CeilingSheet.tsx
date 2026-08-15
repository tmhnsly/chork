"use client";

import { useState } from "react";
import { BottomSheet, Button, SheetBody, TabPills } from "@/components/ui";
import type { TabPillOption } from "@/components/ui";
import { gradeOptions } from "@/lib/data/grade-label";
import type { MatchGradingScale, MatchPlayerView } from "@/lib/data/match-types";
import styles from "./ceilingSheet.module.scss";

interface Props {
  player: MatchPlayerView;
  grades: Array<{ ordinal: number; label: string }>;
  gradingScale: MatchGradingScale;
  minGrade: number | null;
  maxGrade: number | null;
  onClose: () => void;
  onSubmit: (ceiling: number | null) => void;
  pending: boolean;
}

/**
 * Declare a player's limit, so the handicap has something to measure
 * against.
 *
 * Your own, or a guest's if you're the host — an account-backed
 * player sets their own, or the handicap becomes something done TO
 * them.
 *
 * "Not set" is a real option, not an empty state: a player without a
 * ceiling scores plain base points, which is the documented fallback
 * rather than a broken row.
 */
export function CeilingSheet({
  player,
  grades,
  gradingScale,
  minGrade,
  maxGrade,
  onClose,
  onSubmit,
  pending,
}: Props) {
  const [ceiling, setCeiling] = useState<number | null>(player.ceiling);

  const options: TabPillOption<number | null>[] = [
    { value: null, label: "Not set" },
    ...gradeOptions(gradingScale, {
      customGrades: grades,
      min: minGrade,
      max: maxGrade,
    }).map((o) => ({ value: o.value as number | null, label: o.label })),
  ];

  const name = player.display_name || player.username || "this climber";

  return (
    <BottomSheet open onClose={onClose} title="Set the limit">
      <SheetBody>
        <p className={styles.intro}>
          The hardest grade {player.is_guest ? name : "you"}{" "}
          {player.is_guest ? "climbs" : "climb"}. Sends at that grade score
          full points; easier ones count for less, so everyone competes
          against themselves.
        </p>

        <div className={styles.field}>
          <span className={styles.label}>Limit</span>
          <TabPills<number | null>
            options={options}
            value={ceiling}
            onChange={setCeiling}
            ariaLabel="Limit"
            layout="wrap"
          />
        </div>

        {ceiling === null && (
          <p className={styles.hint}>
            {player.is_guest
              ? `Without a limit set, ${name} scores normal points`
              : "Without a limit set, you score normal points"}{" "}
            — the handicap won&apos;t apply.
          </p>
        )}

        <Button
          type="button"
          onClick={() => onSubmit(ceiling)}
          disabled={pending}
          fullWidth
        >
          Save
        </Button>
      </SheetBody>
    </BottomSheet>
  );
}
