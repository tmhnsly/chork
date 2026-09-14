import { SegmentedControlSkeleton } from "@/components/ui";
import { LeaderboardRowSkeleton } from "@/components/ui/LeaderboardRow/LeaderboardRowSkeleton";
import { GymStatsStripSkeleton } from "./GymStatsStripSkeleton";
import { PodiumSkeleton } from "./PodiumSkeleton";
import { ScoringBreakdown } from "./ScoringBreakdown";
import { InviteCardSkeleton } from "./InviteCardSkeleton";
import boardStyles from "./leaderboardView.module.scss";
import listStyles from "./leaderboardList.module.scss";

/**
 * `LeaderboardView`, waiting: the view's own stack and stylesheets,
 * each section in its component's waiting state — the stats strip,
 * the segmented control, the board (podium + two rows, named as the
 * shared element so the Card page's rank strip morphs into it), the
 * scoring explainer (static, so it simply renders) and the invite.
 */
export function LeaderboardSkeleton() {
  return (
    <div className={boardStyles.view} aria-hidden>
      <GymStatsStripSkeleton />
      <div className={boardStyles.segmentRow}>
        <SegmentedControlSkeleton options={["This set", "All time"]} />
      </div>
      <div className={boardStyles.board} data-vt="board">
        <PodiumSkeleton />
        <ul className={listStyles.list}>
          <li><LeaderboardRowSkeleton rank={4} /></li>
          <li><LeaderboardRowSkeleton rank={5} /></li>
        </ul>
      </div>
      <ScoringBreakdown />
      <InviteCardSkeleton />
    </div>
  );
}
