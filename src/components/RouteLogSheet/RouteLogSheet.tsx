"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import {
  FaEyeSlash,
  FaEye,
  FaPaperPlane,
  FaBolt,
  FaPen,
  FaCheck,
  FaXmark,
  FaHeart,
  FaRegHeart,
  FaChevronDown,
  FaArrowRight,
} from "react-icons/fa6";
import type { ReactNode } from "react";
import { pickSendMessage } from "@/lib/send-messages";
import {
  AttemptCounter,
  CompletedRow,
  LogSheetHeader,
  ZoneHoldRow,
} from "@/components/ui";
import { GradeSlider } from "./GradeSlider";
import { formatGrade, type GradingScale } from "@/lib/data/grade-label";
import type { RouteSet, Route, RouteLog, Comment, PaginatedComments } from "@/lib/data";
import { createOptimisticLog } from "@/lib/data";
import { isFlash, computePoints } from "@/lib/data";
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
import { Button, shimmerStyles, showToast, showAchievementToast, UserAvatar } from "@/components/ui";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { BrandDivider } from "@/components/ui/BrandDivider";
import styles from "./routeLogSheet.module.scss";

import { logger } from "@/lib/logger";
import { formatErrorForLog } from "@/lib/errors";
/** Data returned by fetchRouteData, cacheable at the SendsGrid level. */
export interface CachedRouteData {
  grade: number | null;
  comments: PaginatedComments;
  likedIds: string[];
}

interface Props {
  set: RouteSet;
  route: Route;
  log: RouteLog | null;
  cachedData?: CachedRouteData;
  onClose: () => void;
  onCacheRouteData?: (routeId: string, data: CachedRouteData) => void;
  onLogUpdate: (routeId: string, log: RouteLog) => void;
}


function PointsPreview({
  attempts,
  zone,
  completed,
  log,
}: {
  attempts: number;
  zone: boolean;
  completed: boolean;
  log: RouteLog | null;
}): ReactNode {
  if (completed && log) {
    const pts = computePoints(log);
    return <><span className={styles.ptsValue}>{pts}</span> pts</>;
  }
  if (attempts === 0) return "\u00A0";
  const pts = computePoints({ attempts, completed: true, zone: false });
  const flash = attempts === 1;
  return (
    <>
      Send now <FaArrowRight className={styles.ptsArrow} />{" "}
      <span className={`${styles.ptsValue} ${flash ? styles.ptsValueFlash : ""}`}>{pts} pts</span>
      {flash && <FaBolt className={styles.ptsFlash} />}
      {zone && <span className={styles.ptsZone}>+1 zone</span>}
    </>
  );
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

  // Beta spray state
  const [betaExpanded, setBetaExpanded] = useState(false);
  const [betaRevealed, setBetaRevealed] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentBody, setCommentBody] = useState("");
  const [posting, setPosting] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadingComments, setLoadingComments] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextPage, setNextPage] = useState(1);
  const [totalComments, setTotalComments] = useState(0);
  const [commentsLoaded, setCommentsLoaded] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");

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
      setExpanded(true);
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

  // ── Comments ──
  async function handlePostComment() {
    if (!navigator.onLine) {
      showToast("You're offline — comments available when you reconnect", "info");
      return;
    }
    const trimmed = commentBody.trim();
    if (!trimmed) return;
    setPosting(true);
    try {
      const result = await postComment(route.id, trimmed);
      if ("error" in result) {
        showToast(result.error, "error");
        return;
      }
      setComments((prev) => [result.comment, ...prev]);
      setTotalComments((n) => n + 1);
      setCommentBody("");
      showToast("Beta posted");
    } catch {
      showToast("Something went wrong", "error");
    } finally {
      setPosting(false);
    }
  }

  async function handleEditComment(commentId: string) {
    const trimmed = editBody.trim();
    if (!trimmed) return;
    const original = comments.find((c) => c.id === commentId);
    if (original && original.body === trimmed) {
      setEditingId(null);
      return;
    }
    const result = await editComment(commentId, trimmed);
    if ("error" in result) {
      showToast(result.error, "error");
      return;
    }
    setComments((prev) => prev.map((c) => (c.id === commentId ? result.comment : c)));
    setEditingId(null);
    showToast("Comment updated");
  }

  async function handleLike(commentId: string) {
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
      prev.map((c) => c.id === commentId ? { ...c, likes: c.likes + (wasLiked ? -1 : 1) } : c)
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
        prev.map((c) => c.id === commentId ? { ...c, likes: c.likes + (wasLiked ? 1 : -1) } : c)
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

          {/* ── Beta spray (collapsible) ──
              When there are no comments, the chevron is replaced by a
              "No comments" label and the toggle is disabled. The post
              form lives outside the drawer (below) so sharing beta
              doesn't compete with reading it for vertical space. */}
          {(() => {
            const hasOwnComment = !!user && comments.some((c) => c.user_id === user.id);
            const noComments = totalComments === 0;
            // Gate on `commentsLoaded && !loadingComments` so the
            // post-comment form never renders until we actually know
            // whether the user has already commented. Without this,
            // the form rendered on first paint (when `comments` is
            // still `[]`), the sheet animated in at its "visible
            // post form" height, then `fetchRouteData` resolved with
            // an existing own-comment, `showPostForm` flipped false,
            // and the `.postFormWrap height: auto → 0` transition
            // snapped the sheet shorter — the "grows too large then
            // pops back into place" artefact on entry.
            const commentsReady = commentsLoaded && !loadingComments;
            const showPostForm =
              commentsReady
              && isCompleted
              && set.active
              && !hasOwnComment
              && !betaExpanded;
            return (
          <>
          <div className={styles.betaSection}>
            <button
              type="button"
              className={styles.betaToggleBtn}
              onClick={handleExpandBeta}
              aria-expanded={betaExpanded}
              disabled={noComments}
              aria-disabled={noComments}
            >
              <span className={styles.sectionLabel}>
                BETA SPRAY
                {totalComments > 0 && ` (${totalComments})`}
              </span>
              {noComments ? (
                <span className={styles.betaEmptyLabel}>No comments</span>
              ) : (
                <FaChevronDown className={`${styles.betaChevron} ${betaExpanded ? styles.betaChevronOpen : ""}`} />
              )}
            </button>

            <div
              className={`${styles.betaDrawer} ${betaExpanded ? styles.betaDrawerOpen : ""}`}
              aria-hidden={!betaExpanded}
            >
              <div className={styles.betaDrawerInner}>
              <div className={styles.betaContent}>
                {loadingComments ? (
                  <div className={styles.commentList} role="status" aria-busy="true" aria-label="Loading beta spray">
                    {[0, 1].map((i) => (
                      <div key={i} className={styles.commentRow}>
                        <div className={styles.avatarLink}>
                          <div className={`${styles.commentAvatar} ${shimmerStyles.skeleton}`} />
                        </div>
                        <div className={styles.commentContent}>
                          <span className={`${shimmerStyles.skeletonLine} ${shimmerStyles.skeletonShort}`} />
                          <span className={shimmerStyles.skeletonLine} />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : comments.length === 0 ? (
                  <p className={styles.betaEmpty}>No comments yet</p>
                ) : (
                  <div className={styles.betaRegion}>
                    {/* Reveal toggle sits OUTSIDE the blur layer so the
                        label stays sharp when the beta is hidden —
                        previously it was nested inside the blurred div
                        and got the same `filter: blur()` as the text. */}
                    {!isCompleted && comments.length > 0 && (
                      <button
                        type="button"
                        className={styles.revealBtn}
                        onClick={() => setBetaRevealed((v) => !v)}
                      >
                        {betaRevealed ? <FaEyeSlash /> : <FaEye />}
                        <span>{betaRevealed ? "Hide beta" : "Reveal beta"}</span>
                      </button>
                    )}
                    <div className={!isCompleted && !betaRevealed ? styles.betaBlurred : ""}>
                    <ul className={styles.commentList}>
                      {(expanded ? comments : comments.slice(0, 2)).map((c) => {
                        const author = c.profiles;
                        const username = author?.username ?? "unknown";
                        const isOwn = user?.id === c.user_id;

                        return (
                          <li key={c.id} className={styles.commentItem}>
                            <div className={styles.commentRow}>
                              <Link href={`/u/${username}`} className={styles.avatarLink}>
                                <UserAvatar
                                  user={{
                                    id: c.user_id,
                                    username,
                                    name: author?.name ?? "",
                                    avatar_url: author?.avatar_url ?? "",
                                  }}
                                  size={32}
                                />
                              </Link>
                              <div className={styles.commentContent}>
                                {/* Render the author line in BOTH modes so the
                                    row height doesn't collapse during edit —
                                    prevents sibling comments (and content
                                    above the panel) from shifting. */}
                                <Link href={`/u/${username}`} className={styles.commentAuthor}>@{username}</Link>
                                {editingId === c.id ? (
                                  <EditCommentForm
                                    initialBody={editBody}
                                    onChange={setEditBody}
                                    onSubmit={() => handleEditComment(c.id)}
                                    onCancel={() => setEditingId(null)}
                                  />
                                ) : (
                                  <>
                                    <p className={styles.commentBody}>{c.body}</p>
                                    {c.likes > 0 && <span className={styles.commentLikes}>{c.likes} {c.likes === 1 ? "like" : "likes"}</span>}
                                  </>
                                )}
                              </div>
                              {isOwn ? (
                                editingId !== c.id && (
                                  <button type="button" className={styles.actionBtn} onClick={() => { setEditingId(c.id); setEditBody(c.body); }} aria-label="Edit comment"><FaPen /></button>
                                )
                              ) : (
                                <button
                                  type="button"
                                  className={`${styles.actionBtn} ${likedIds.has(c.id) ? styles.likeBtnActive : ""}`}
                                  onClick={() => handleLike(c.id)}
                                  aria-label={likedIds.has(c.id) ? "Unlike" : "Like"}
                                >
                                  {likedIds.has(c.id) ? <FaHeart /> : <FaRegHeart />}
                                </button>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                    {!expanded && comments.length > 2 ? (
                      <button type="button" className={styles.loadMore} onClick={() => setExpanded(true)}>
                        Show {comments.length - 2} more
                      </button>
                    ) : hasMore && (
                      <button type="button" className={styles.loadMore} onClick={loadMore} disabled={loadingMore}>
                        {loadingMore ? "Loading..." : "Load more"}
                      </button>
                    )}
                    </div>
                  </div>
                )}

              </div>
              </div>
            </div>
          </div>

          <div
            className={`${styles.postFormWrap} ${showPostForm ? styles.postFormVisible : ""}`}
            aria-hidden={!showPostForm}
          >
            <div className={styles.postFormInner}>
              <form className={styles.commentForm} onSubmit={(e) => { e.preventDefault(); handlePostComment(); }}>
                <input
                  type="text"
                  className={styles.commentInput}
                  placeholder="Share beta..."
                  aria-label="Share beta"
                  value={commentBody}
                  onChange={(e) => setCommentBody(e.target.value)}
                  disabled={posting || !showPostForm}
                  tabIndex={showPostForm ? 0 : -1}
                />
                <button
                  type="submit"
                  className={styles.commentSubmit}
                  disabled={posting || !commentBody.trim() || !showPostForm}
                  aria-label="Post comment"
                  tabIndex={showPostForm ? 0 : -1}
                >
                  <FaPaperPlane />
                </button>
              </form>
            </div>
          </div>
          </>
            );
          })()}
    </BottomSheet>
  );
}

/**
 * Inline edit form for a comment.
 *
 * We focus the input on mount and explicitly scroll it into view
 * afterwards. The `scrollIntoView` call mirrors what iOS does when
 * the user taps an input directly — the browser lifts the field
 * above the virtual keyboard. When focus is triggered *program-
 * matically* (our effect), iOS does not perform that lift, which
 * used to leave the edit input hidden behind the keyboard. A small
 * timeout gives the keyboard animation time to start so the scroll
 * position settles above it.
 *
 * The earlier "panel shifts up when editing" bug was fixed in CSS
 * by pinning the edit-form row height — that's why it's safe to
 * re-enable the natural scroll-into-view behaviour here.
 */
function EditCommentForm({
  initialBody,
  onChange,
  onSubmit,
  onCancel,
}: {
  initialBody: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    const id = window.setTimeout(() => {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 120);
    return () => window.clearTimeout(id);
  }, []);

  return (
    <div className={styles.editForm}>
      <input
        ref={inputRef}
        type="text"
        className={styles.commentInput}
        value={initialBody}
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        type="button"
        className={styles.editConfirm}
        onClick={onSubmit}
        disabled={!initialBody.trim()}
        aria-label="Save comment"
      >
        <FaCheck />
      </button>
      <button
        type="button"
        className={styles.editCancel}
        onClick={onCancel}
        aria-label="Cancel edit"
      >
        <FaXmark />
      </button>
    </div>
  );
}
