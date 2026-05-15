"use client";

import { PointsPreview } from "./PointsPreview";
import { CommentThread } from "./CommentThread";
import {
  AttemptCounter,
  CompletedRow,
  LogSheetHeader,
  ZoneHoldRow,
} from "@/components/ui";
import { GradeSlider } from "./GradeSlider";
import type { GradingScale } from "@/lib/data/grade-label";
import type { RouteSet, Route, RouteLog } from "@/lib/data";
import type { CachedRouteData } from "./types";
import { useAuth } from "@/lib/auth-context";
import { Button, shimmerStyles } from "@/components/ui";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { BrandDivider } from "@/components/ui/BrandDivider";
import { useRouteLogState } from "./useRouteLogState";
import styles from "./routeLogSheet.module.scss";

interface Props {
  set: RouteSet;
  route: Route;
  log: RouteLog | null;
  cachedData?: CachedRouteData;
  onClose: () => void;
  onCacheRouteData?: (routeId: string, data: CachedRouteData) => void;
  onLogUpdate: (routeId: string, log: RouteLog) => void;
}

/**
 * The bottom sheet that opens when a climber taps a route tile on
 * the Wall. Pure orchestrator — all state, async handlers, and
 * lifecycle live in `useRouteLogState`. This file is the JSX tree +
 * the conditional grade-label subline ladder + the CommentThread
 * bridge.
 */
export function RouteLogSheet({
  set,
  route,
  log,
  cachedData,
  onClose,
  onCacheRouteData,
  onLogUpdate,
}: Props) {
  const { profile: user } = useAuth();
  const gradingScale = (set.grading_scale ?? "v") as GradingScale;
  const maxGrade = set.max_grade ?? undefined;
  const gradingDisabled = gradingScale === "points";

  const {
    state,
    isCompleted,
    isCurrentFlash,
    zoneValue,
    changeAttempts,
    handleMarkComplete,
    handleUncomplete,
    handleZoneToggle,
    handleGradeVote,
    handleExpandBeta,
    loadMore,
    onPostComment,
    onEditComment,
    onLikeComment,
  } = useRouteLogState({
    set,
    route,
    log,
    cachedData,
    userId: user?.id,
    onLogUpdate,
    onCacheRouteData,
  });

  return (
    <BottomSheet
      open
      onClose={onClose}
      title={`Route ${route.number}`}
      description={`Log details for route ${route.number}`}
      // Grow toward the top of the viewport once the beta drawer is
      // open so comment threads have room without pushing the rest
      // of the sheet off screen.
      size={state.betaExpanded ? "tall" : "default"}
    >
      <LogSheetHeader
        number={route.number}
        showFlash={isCurrentFlash}
        showZone={zoneValue}
        subline={
          gradingDisabled ? null : state.gradeLabel === null ? (
            <span
              className={`${styles.communityGradeLine} ${styles.communityGradeSkeleton} ${shimmerStyles.skeleton}`}
              aria-hidden="true"
            />
          ) : state.gradeLabel === "Ungraded" ? (
            <span className={`${styles.communityGradeLine} ${styles.communityGradeMeta}`}>
              Ungraded
            </span>
          ) : (
            <span className={styles.communityGradeLine}>
              <span className={styles.communityGradeValue}>{state.gradeLabel}</span>
              <BrandDivider />
              <span className={styles.communityGradeMeta}>Community grade</span>
            </span>
          )
        }
      />

      <AttemptCounter
        attempts={state.attempts}
        hideControls={isCompleted}
        disabled={isCompleted || !set.active}
        onChange={changeAttempts}
        pointsEarned={isCompleted}
        pointsPreview={
          <PointsPreview
            attempts={state.attempts}
            zone={zoneValue}
            completed={isCompleted}
            log={state.currentLog}
          />
        }
      />

      <div className={styles.controls}>
        {/* Zone hold — only shown pre-send. Once the route is
            completed, the toggle is disabled anyway; we surface
            the claimed zone as a chip next to the "Sent / Flashed"
            badge instead so the sheet stays tight. */}
        {route.has_zone && !isCompleted && (
          <ZoneHoldRow
            checked={zoneValue}
            onCheckedChange={handleZoneToggle}
            hasAttempts={state.attempts > 0}
          />
        )}

        {/* Complete / Undo */}
        {isCompleted && set.active ? (
          <CompletedRow
            isFlash={isCurrentFlash}
            hasZone={zoneValue}
            onUndo={handleUncomplete}
          />
        ) : (
          <Button
            onClick={handleMarkComplete}
            disabled={state.attempts < 1 || !set.active || state.completing}
            fullWidth
          >
            {state.completing ? "Saving..." : "Mark as complete"}
          </Button>
        )}

        {/* Grade slider (post-completion only). Hidden entirely
            for points-only sets where the admin has opted out of
            climber-side grading. */}
        {isCompleted && !gradingDisabled && (
          <GradeSlider
            value={state.gradeVote}
            scale={gradingScale}
            maxGrade={maxGrade}
            onChange={handleGradeVote}
          />
        )}
      </div>

      <CommentThread
        userId={user?.id}
        isCompleted={isCompleted}
        setActive={set.active}
        betaExpanded={state.betaExpanded}
        onToggleBetaExpanded={handleExpandBeta}
        comments={state.comments}
        totalComments={state.totalComments}
        hasMore={state.hasMore}
        loadingComments={state.loadingComments}
        loadingMore={state.loadingMore}
        likedIds={state.likedIds}
        commentsLoaded={state.commentsLoaded}
        onLoadMore={loadMore}
        onPostComment={onPostComment}
        onEditComment={onEditComment}
        onLikeComment={onLikeComment}
      />
    </BottomSheet>
  );
}
