import { PageHeaderSkeleton, SegmentedControlSkeleton } from "@/components/ui";
import { LeaderboardRowSkeleton } from "@/components/ui/LeaderboardRow/LeaderboardRowSkeleton";
import { GymStatsStripSkeleton } from "@/components/Leaderboard/GymStatsStripSkeleton";
import { PodiumSkeleton } from "@/components/Leaderboard/PodiumSkeleton";
import { ScoringBreakdown } from "@/components/Leaderboard/ScoringBreakdown";
import { InviteCardSkeleton } from "@/components/Leaderboard/InviteCardSkeleton";
import boardStyles from "@/components/Leaderboard/leaderboardView.module.scss";
import listStyles from "@/components/Leaderboard/leaderboardList.module.scss";
import styles from "./loading.module.scss";

/**
 * Skeleton for /leaderboard: the real page's own components in their
 * waiting state, on the real page's own stylesheets. The stats strip,
 * the segmented control, the board (podium + two rows), the scoring
 * explainer — which is static, so it simply renders — and the invite
 * card. Nothing here is a guessed height; a change to any of those
 * components' layouts reaches this file through the shared styles.
 */
export default function LeaderboardLoading() {
  return (
    <main className={styles.page} aria-busy="true" aria-label="Loading Chorkboard">
      <PageHeaderSkeleton />
      <div className={boardStyles.view}>
        <GymStatsStripSkeleton />
        <div className={boardStyles.segmentRow}>
          <SegmentedControlSkeleton options={["This set", "All time"]} />
        </div>
        {/* Named as the shared element so the Card page's rank strip
            morphs into it before the real board arrives. */}
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
    </main>
  );
}
