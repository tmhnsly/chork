"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { pickSendMessage } from "@/lib/send-messages";
import { PointsPreview } from "./PointsPreview";
import { CommentThread } from "./CommentThread";
import {
  AttemptCounter,
  CompletedRow,
  LogSheetHeader,
  ZoneHoldRow,
} from "@/components/ui";
import { GradeSlider } from "./GradeSlider";
import { formatGrade, type GradingScale } from "@/lib/data/grade-label";
import type { RouteSet, Route, RouteLog, Comment } from "@/lib/data";
import type { CachedRouteData } from "./types";
import { createOptimisticLog, isFlash } from "@/lib/data";
import { useAuth } from "@/lib/auth-context";
import {
  offlineUpdateAttempts as updateAttempts,
  offlineCompleteRoute as completeRoute,
  offlineUncompleteRoute as uncompleteRoute,
  offlineToggleZone as toggleZone,
  offlineUpdateGradeVote as updateGradeVote,
} from "@/lib/offline";
import {
  postComment,
  fetchComments,
  fetchRouteData,
  editComment,
  likeComment,
} from "@/app/(app)/actions";
import { Button, shimmerStyles, showToast, showAchievementToast } from "@/components/ui";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { BrandDivider } from "@/components/ui/BrandDivider";
import styles from "./routeLogSheet.module.scss";

import { logger } from "@/lib/logger";
import { formatErrorForLog } from "@/lib/errors";
interface Props {
  set: RouteSet;
  route: Route;
  log: RouteLog | null;
  cachedData?: CachedRouteData;
  onClose: () => void;
  onCacheRouteData?: (routeId: string, data: CachedRouteData) => void;
  onLogUpdate: (routeId: string, log: RouteLog) => void;
}


export function RouteLogSheet({ set, route, log, cachedData, onClose, onCacheRouteData, onLogUpdate }: Props) {
  const { profile: user } = useAuth();
  const [attempts, setAttempts] = useState(log?.attempts ?? 0);
  const [currentLog, setCurrentLog] = useState(log);
  const [gradeLabel, setGradeLabel] = useState<string | null>(null);
  const [gradeVote, setGradeVote] = useState<number | null>(log?.grade_vote ?? null);

  // Scale context pulled from the active set. When the set's grading
  // scale is "points", the rating UI is hidden entirely and the header
  // doesn't try to show a community grade.
  const gradingScale = (set.grading_scale ?? "v") as GradingScale;
  const maxGrade = set.max_grade ?? undefined;
  const gradingDisabled = gradingScale === "points";
  const [completing, setCompleting] = useState(false);

  // Beta spray data state — owned here so the BottomSheet can size on
  // `betaExpanded` and so the parent's cache (`onCacheRouteData`) sees
  // the same comments view the user has interacted with. Local UI state
  // (input draft, posting flag, edit draft, etc.) lives in CommentThread.
  const [betaExpanded, setBetaExpanded] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingComments, setLoadingComments] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextPage, setNextPage] = useState(1);
  const [totalComments, setTotalComments] = useState(0);
  const [commentsLoaded, setCommentsLoaded] = useState(false);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gradeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingAttemptsRef = useRef<number | null>(null);
  const logIdRef = useRef(currentLog?.id);
  const onCacheRef = useRef(onCacheRouteData);
  const onLogUpdateRef = useRef(onLogUpdate);
  const likingRef = useRef<Set<string>>(new Set());
  const currentLogRef = useRef(currentLog);

  logIdRef.current = currentLog?.id;
  currentLogRef.current = currentLog;
  onCacheRef.current = onCacheRouteData;
  onLogUpdateRef.current = onLogUpdate;

  const isCompleted = currentLog?.completed ?? false;
  const isCurrentFlash = currentLog ? isFlash(currentLog) : false;
  const zoneValue = currentLog?.zone ?? false;

  // ── Fetch grade (always), comments (on beta expand) ──
  useEffect(() => {
    if (cachedData) {
      const { grade, comments: result, likedIds: liked } = cachedData;
      setGradeLabel(grade !== null ? (formatGrade(grade, gradingScale) ?? "Ungraded") : "Ungraded");
      setLikedIds(new Set(liked));
      setComments(result.items);
      setTotalComments(result.totalItems);
      setHasMore(result.page < result.totalPages);
      setNextPage(2);
      setCommentsLoaded(true);
      return;
    }

    // Fetch grade eagerly — set commentsLoaded immediately to prevent
    // double-fetch if user expands beta spray before this resolves
    setCommentsLoaded(true);
    setLoadingComments(true);
    fetchRouteData(route.id)
      .then((data) => {
        const { grade, comments: result, likedIds: liked } = data;
        setGradeLabel(grade !== null ? (formatGrade(grade, gradingScale) ?? "Ungraded") : "Ungraded");
        setLikedIds(new Set(liked));
        setComments(result.items);
        setTotalComments(result.totalItems);
        setHasMore(result.page < result.totalPages);
        setNextPage(2);
        onCacheRef.current?.(route.id, data);
      })
      .catch((err) => logger.warn("fetchroutedata_failed", { err: formatErrorForLog(err) }))
      .finally(() => setLoadingComments(false));
  }, [route.id, cachedData, gradingScale]);

  // ── Load comments when beta expanded (lazy) ──
  function handleExpandBeta() {
    setBetaExpanded((v) => !v);
    if (!commentsLoaded && !loadingComments) {
      setLoadingComments(true);
      fetchComments(route.id, 1)
        .then((result) => {
          setComments(result.items);
          setTotalComments(result.totalItems);
          setHasMore(result.page < result.totalPages);
          setNextPage(2);
          setCommentsLoaded(true);
        })
        .finally(() => setLoadingComments(false));
    }
  }

  async function loadMore() {
    setLoadingMore(true);
    try {
      const result = await fetchComments(route.id, nextPage);
      setComments((prev) => [...prev, ...result.items]);
      setTotalComments(result.totalItems);
      setHasMore(result.page < result.totalPages);
      setNextPage((p) => p + 1);
    } finally {
      setLoadingMore(false);
    }
  }

  // ── Attempt management ──
  const saveAttempts = useCallback(
    async (value: number) => {
      const result = await updateAttempts(route.id, value, logIdRef.current);
      if ("error" in result) {
        showToast(result.error, "error");
        return;
      }
      if (result.log) {
        setCurrentLog(result.log);
        onLogUpdateRef.current(route.id, result.log);
      }
    },
    [route.id]
  );

  function changeAttempts(delta: number) {
    if (isCompleted || !set.active) return;
    const next = Math.max(0, attempts + delta);
    setAttempts(next);
    pendingAttemptsRef.current = next;

    const optimisticLog: RouteLog = currentLog
      ? { ...currentLog, attempts: next }
      : createOptimisticLog({
          id: "",
          user_id: user?.id ?? "",
          route_id: route.id,
          gym_id: set.gym_id,
          attempts: next,
          completed: false,
          zone: false,
        });
    onLogUpdate(route.id, optimisticLog);

    if ("vibrate" in navigator) navigator.vibrate(10);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      pendingAttemptsRef.current = null;
      saveAttempts(next);
    }, 800);
  }

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        if (pendingAttemptsRef.current !== null) {
          saveAttempts(pendingAttemptsRef.current);
        }
      }
    };
  }, [saveAttempts]);

  // ── Complete / Uncomplete ──
  async function handleMarkComplete() {
    if (attempts < 1 || completing) return;
    setCompleting(true);

    // Cancel any pending debounced attempts-save. If we don't, the
    // debounce fires after completeRoute has already started and its
    // updateAttempts RPC returns a log with completed=false, which
    // overwrites the completion state and flashes the panel back to
    // the non-completed layout before the completeRoute response
    // lands and flips it forward again.
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    pendingAttemptsRef.current = null;

    const optimisticLog = createOptimisticLog({
      id: currentLog?.id ?? "",
      user_id: user?.id ?? "",
      route_id: route.id,
      gym_id: set.gym_id,
      attempts,
      completed: true,
      grade_vote: gradeVote ?? undefined,
      zone: zoneValue,
    });

    setCurrentLog(optimisticLog);
    onLogUpdate(route.id, optimisticLog);
    showToast(pickSendMessage(attempts === 1));

    const result = await completeRoute(route.id, attempts, gradeVote, zoneValue, currentLog?.id);
    if ("error" in result) {
      showToast(result.error, "error");
      // Revert
      setCurrentLog(log);
      setAttempts(log?.attempts ?? 0);
      if (log) onLogUpdate(route.id, log);
    } else if (result.log) {
      setCurrentLog(result.log);
      onLogUpdate(route.id, result.log);
      // Each newly-earned achievement gets its own rich toast.
      // Stagger the dispatch so multiple awards stack visibly
      // instead of collapsing onto the same `tag` slot — react-hot-
      // toast's queue still serialises them but the staggered call
      // keeps the slide-in feeling intentional rather than batched.
      if (result.earnedBadges) {
        result.earnedBadges.forEach((badge, i) => {
          setTimeout(() => showAchievementToast(badge), i * 250);
        });
      }
    }
    setCompleting(false);
  }

  async function handleUncomplete() {
    const previousLog = currentLog;
    const previousAttempts = attempts;
    const previousGradeVote = gradeVote;

    // Optimistic: flip to incomplete immediately so the UI feels instant.
    const optimisticLog = previousLog
      ? { ...previousLog, completed: false, grade_vote: null }
      : previousLog;
    if (optimisticLog) {
      setCurrentLog(optimisticLog);
      onLogUpdate(route.id, optimisticLog);
    }
    setGradeVote(null);
    showToast("Completion removed");

    const result = await uncompleteRoute(route.id, previousLog?.id);
    if ("error" in result) {
      showToast(result.error, "error");
      setCurrentLog(previousLog);
      setAttempts(previousAttempts);
      setGradeVote(previousGradeVote);
      if (previousLog) onLogUpdate(route.id, previousLog);
      return;
    }
    if (result.log) {
      setCurrentLog(result.log);
      setAttempts(result.log.attempts);
      onLogUpdate(route.id, result.log);
    }
  }

  // ── Zone toggle ──
  const zoningRef = useRef(false);
  async function handleZoneToggle(checked: boolean) {
    if (zoningRef.current) return;
    zoningRef.current = true;

    setCurrentLog((prev) => (prev ? { ...prev, zone: checked } : prev));
    const latest = currentLogRef.current;
    if (latest) onLogUpdate(route.id, { ...latest, zone: checked });

    const result = await toggleZone(route.id, checked, logIdRef.current);
    if ("error" in result) {
      showToast(result.error, "error");
      setCurrentLog((prev) => (prev ? { ...prev, zone: !checked } : prev));
    }
    zoningRef.current = false;
  }

  // ── Comments — data-side handlers (orchestrator owns the array) ──
  //
  // Returns boolean so CommentThread can clear its input on success.
  // The local UI state (input draft, posting flag) lives there.
  async function onPostComment(body: string): Promise<boolean> {
    try {
      const result = await postComment(route.id, body);
      if ("error" in result) {
        showToast(result.error, "error");
        return false;
      }
      setComments((prev) => [result.comment, ...prev]);
      setTotalComments((n) => n + 1);
      return true;
    } catch {
      showToast("Something went wrong", "error");
      return false;
    }
  }

  async function onEditCommentAction(commentId: string, body: string): Promise<boolean> {
    const result = await editComment(commentId, body);
    if ("error" in result) {
      showToast(result.error, "error");
      return false;
    }
    setComments((prev) => prev.map((c) => (c.id === commentId ? result.comment : c)));
    return true;
  }

  // Like is fire-and-forget with optimistic UI + revert on error.
  // Debounced per-comment-id via likingRef so spamming the heart
  // button never sends duplicate requests.
  async function onLikeComment(commentId: string) {
    if (!navigator.onLine) {
      showToast("You're offline — likes available when you reconnect", "info");
      return;
    }
    if (likingRef.current.has(commentId)) return;
    likingRef.current.add(commentId);

    const wasLiked = likedIds.has(commentId);
    setLikedIds((prev) => {
      const next = new Set(prev);
      if (wasLiked) next.delete(commentId);
      else next.add(commentId);
      return next;
    });
    setComments((prev) =>
      prev.map((c) =>
        c.id === commentId ? { ...c, likes: c.likes + (wasLiked ? -1 : 1) } : c,
      ),
    );

    const result = await likeComment(commentId);
    if (result.error) {
      setLikedIds((prev) => {
        const next = new Set(prev);
        if (wasLiked) next.add(commentId);
        else next.delete(commentId);
        return next;
      });
      setComments((prev) =>
        prev.map((c) =>
          c.id === commentId ? { ...c, likes: c.likes + (wasLiked ? 1 : -1) } : c,
        ),
      );
      showToast(result.error, "error");
    }
    likingRef.current.delete(commentId);
  }

  return (
    <BottomSheet
      open
      onClose={onClose}
      title={`Route ${route.number}`}
      description={`Log details for route ${route.number}`}
      // Grow toward the top of the viewport once the beta drawer is
      // open so comment threads have room without pushing the rest
      // of the sheet off screen.
      size={betaExpanded ? "tall" : "default"}
    >
          <LogSheetHeader
            number={route.number}
            showFlash={isCurrentFlash}
            showZone={zoneValue}
            subline={
              gradingDisabled ? null : gradeLabel === null ? (
                <span
                  className={`${styles.communityGradeLine} ${styles.communityGradeSkeleton} ${shimmerStyles.skeleton}`}
                  aria-hidden="true"
                />
              ) : gradeLabel === "Ungraded" ? (
                <span className={`${styles.communityGradeLine} ${styles.communityGradeMeta}`}>
                  Ungraded
                </span>
              ) : (
                <span className={styles.communityGradeLine}>
                  <span className={styles.communityGradeValue}>{gradeLabel}</span>
                  <BrandDivider />
                  <span className={styles.communityGradeMeta}>Community grade</span>
                </span>
              )
            }
          />

          <AttemptCounter
            attempts={attempts}
            hideControls={isCompleted}
            disabled={isCompleted || !set.active}
            onChange={(next) => changeAttempts(next - attempts)}
            pointsEarned={isCompleted}
            pointsPreview={
              <PointsPreview
                attempts={attempts}
                zone={zoneValue}
                completed={isCompleted}
                log={currentLog}
              />
            }
          />

          {/* ── Secondary controls ── */}
          <div className={styles.controls}>
            {/* Zone hold — only shown pre-send. Once the route is
                completed, the toggle is disabled anyway; we surface
                the claimed zone as a chip next to the "Sent / Flashed"
                badge instead so the sheet stays tight. */}
            {route.has_zone && !isCompleted && (
              <ZoneHoldRow
                checked={zoneValue}
                onCheckedChange={handleZoneToggle}
                hasAttempts={attempts > 0}
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
                disabled={attempts < 1 || !set.active || completing}
                fullWidth
              >
                {completing ? "Saving..." : "Mark as complete"}
              </Button>
            )}

            {/* Grade slider (post-completion only). Hidden entirely
                for points-only sets where the admin has opted out of
                climber-side grading. */}
            {isCompleted && !gradingDisabled && (
              <GradeSlider
                value={gradeVote}
                scale={gradingScale}
                maxGrade={maxGrade}
                onChange={(grade) => {
                  setGradeVote(grade);
                  // Debounce the server call — user may tap multiple chips quickly
                  if (gradeDebounceRef.current) clearTimeout(gradeDebounceRef.current);
                  gradeDebounceRef.current = setTimeout(async () => {
                    const logId = logIdRef.current;
                    if (!logId) return;
                    const result = await updateGradeVote(route.id, grade, logId);
                    if ("error" in result) {
                      showToast(result.error, "error");
                      return;
                    }
                    if (result.log) {
                      setCurrentLog(result.log);
                      onLogUpdateRef.current(route.id, result.log);
                    }
                    // Refresh the community grade to reflect the new
                    // vote (or the removal of a vote — the DB's
                    // `get_route_grade` excludes null votes, so
                    // toggling grading off drops this climber's
                    // contribution from the average).
                    try {
                      const fresh = await fetchRouteData(route.id);
                      setGradeLabel(
                        fresh.grade !== null
                          ? (formatGrade(fresh.grade, gradingScale) ?? "Ungraded")
                          : "Ungraded",
                      );
                      onCacheRef.current?.(route.id, fresh);
                    } catch (err) {
                      logger.warn("grade_refresh_failed", { err: formatErrorForLog(err) });
                    }
                  }, 600);
                }}
              />
            )}
          </div>

          <CommentThread
            userId={user?.id}
            isCompleted={isCompleted}
            setActive={set.active}
            betaExpanded={betaExpanded}
            onToggleBetaExpanded={handleExpandBeta}
            comments={comments}
            totalComments={totalComments}
            hasMore={hasMore}
            loadingComments={loadingComments}
            loadingMore={loadingMore}
            likedIds={likedIds}
            commentsLoaded={commentsLoaded}
            onLoadMore={loadMore}
            onPostComment={onPostComment}
            onEditComment={onEditCommentAction}
            onLikeComment={onLikeComment}
          />
    </BottomSheet>
  );
}

