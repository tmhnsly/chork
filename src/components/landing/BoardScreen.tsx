"use client";

import { useRef } from "react";
import { toLeaderboardRowData } from "@/components/ui";
import { Podium } from "@/components/ui/Podium/Podium";
import { useFlip } from "@/hooks/use-flip";
import { YOU } from "./fixtures";
import { boardScreenAt } from "./screens/boardScreen";
import { BoardRows } from "./BoardRows";
import styles from "./boardScreen.module.scss";

interface Props {
  step: number;
}

const noop = () => {};

/**
 * The leaderboard on the device: the podium, then the rows under it.
 * The podium's columns are keyed by climber, and a FLIP carries each
 * one to its new place when the ranking changes — your lime plinth
 * slides across and grows as you move up, rather than you reappearing
 * somewhere else.
 */
export function BoardScreen({ step }: Props) {
  const { entries } = boardScreenAt(step);
  const podium = entries.slice(0, 3);
  const rows = entries.slice(3, 7);
  const ref = useRef<HTMLDivElement>(null);
  // Held by the bottom: the columns stand on the podium's floor.
  useFlip(ref, step, "bottom");
  return (
    <>
      <div ref={ref} className={styles.podium}>
        <Podium top={podium} currentUserId={YOU.id} onPress={noop} entrance={false} />
      </div>
      <BoardRows rows={rows.map(toLeaderboardRowData)} youId={YOU.id} />
    </>
  );
}
