"use client";

import { computePoints, deriveTileState, isFlash } from "@/lib/data";
import {
  AttemptCounter,
  Button,
  CompletedRow,
  Legend,
  LogSheetHeader,
  PointsPreview,
  TileGrid,
} from "@/components/ui";
import { SendGridTile } from "@/components/ui/SendGridTile/SendGridTile";
import { RankStrip } from "@/components/ui/RankStrip/RankStrip";
import { formatGrade } from "@/lib/data/grade-label";
import { ROUTES, TAPPED_ROUTE } from "./fixtures";
import { cardScreenAt } from "./screens/cardScreen";
import styles from "./cardScreen.module.scss";

interface Props {
  step: number;
}

const noop = () => {};

/**
 * Your card, on the device: the rank strip, the legend and the send
 * grid — the app's own components with the fixture's logs — plus the
 * log sheet for the tapped route when the step has it open.
 */
export function CardScreen({ step }: Props) {
  const { logs, sheet, rank } = cardScreenAt(step);
  const tapped = ROUTES.find((r) => r.number === TAPPED_ROUTE);
  const grade = tapped?.community_grade != null ? formatGrade(tapped.community_grade, "v") : null;

  return (
    <div className={styles.card}>
      <RankStrip rank={rank} gained={null} share={false} />
      <Legend />
      <TileGrid>
        {ROUTES.map((route) => {
          const log = logs.get(route.id);
          return (
            <SendGridTile
              key={route.id}
              number={route.number}
              state={deriveTileState(log)}
              zone={log?.zone}
              onClick={noop}
            />
          );
        })}
      </TileGrid>

      {tapped && (
        <div className={styles.sheet} data-open={sheet !== null}>
          <LogSheetHeader
            number={tapped.number}
            showFlash={sheet ? isFlash({ attempts: sheet.attempts, completed: sheet.completed }) : false}
            subline={grade ? `${grade} · Community grade` : "Ungraded"}
          />
          <AttemptCounter
            attempts={sheet?.attempts ?? 0}
            onChange={noop}
            hideControls={sheet?.completed}
            pointsEarned={sheet?.completed ?? false}
            pointsPreview={
              <PointsPreview
                attempts={sheet?.attempts ?? 0}
                completed={sheet?.completed ?? false}
                earned={sheet ? computePoints({ attempts: sheet.attempts, completed: sheet.completed, zone: false }) : 0}
                preview={sheet ? computePoints({ attempts: sheet.attempts, completed: true, zone: false }) : 0}
                zone={false}
              />
            }
          />
          {sheet?.completed ? (
            <CompletedRow isFlash={false} onUndo={noop} />
          ) : (
            <Button fullWidth onClick={noop}>Mark as complete</Button>
          )}
        </div>
      )}
    </div>
  );
}
