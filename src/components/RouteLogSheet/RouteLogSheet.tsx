"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as VisuallyHidden from "@radix-ui/react-visually-hidden";
import * as Switch from "@radix-ui/react-switch";
import Image from "next/image";
import Link from "next/link";
import {
  FaMinus,
  FaPlus,
  FaEyeSlash,
  FaEye,
  FaPaperPlane,
  FaBolt,
  FaPen,
  FaCheck,
  FaXmark,
  FaBullseye,
  FaHeart,
  FaRegHeart,
} from "react-icons/fa6";
import { RollingNumber } from "@/components/RollingNumber/RollingNumber";
import type { RouteSet, Route, RouteLog, Comment, PaginatedComments } from "@/lib/data";
import { createOptimisticLog } from "@/lib/data";
import { isFlash, computePoints } from "@/lib/data";
import { useAuth } from "@/lib/auth-context";
import { getAvatarUrl } from "@/lib/avatar";
import {
  updateAttempts,
  uncompleteRoute,
  toggleZone,
  postComment,
  fetchComments,
  fetchRouteData,
  editComment,
  likeComment,
} from "@/app/(app)/actions";
import { Button, shimmerStyles, showToast } from "@/components/ui";
import { CompleteModal } from "@/components/CompleteModal/CompleteModal";
import styles from "./routeLogSheet.module.scss";

/** Data returned by fetchRouteData, cacheable at the SendGrid level. */
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

const DRAG_CLOSE_THRESHOLD = 60;
const DRAG_VELOCITY_THRESHOLD = 0.4; // px/ms — fast swipe closes regardless of distance

function getPointsPreview(
  attempts: number,
  zone: boolean,
  completed: boolean,
  log: RouteLog | null
): string | null {
  if (completed && log) {
    const pts = computePoints(log);
    return `${pts} pts`;
  }
  if (attempts === 0) return null;
  const previewPts = computePoints({ attempts, completed: true, zone: false });
  const flash = attempts === 1;
  let text = `Send now \u2192 ${previewPts} pts`;
  if (flash) text += " \u26A1";
  if (zone) text += " +1 zone";
  return text;
}

export function RouteLogSheet({ set, route, log, cachedData, onClose, onCacheRouteData, onLogUpdate }: Props) {
  const { profile: user } = useAuth();
  const [attempts, setAttempts] = useState(log?.attempts ?? 0);
  const [currentLog, setCurrentLog] = useState(log);
  const [showComplete, setShowComplete] = useState(false);
  const [closing, setClosing] = useState(false);
  const [betaRevealed, setBetaRevealed] = useState(false);
  const [gradeLabel, setGradeLabel] = useState<string | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentBody, setCommentBody] = useState("");
  const [posting, setPosting] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadingComments, setLoadingComments] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextPage, setNextPage] = useState(1);
  const [totalComments, setTotalComments] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingAttemptsRef = useRef<number | null>(null);
  const logIdRef = useRef(currentLog?.id);
  const contentRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startY: number; startTime: number; dragging: boolean }>({ startY: 0, startTime: 0, dragging: false });
  const preCompleteRef = useRef<{ log: RouteLog | null; attempts: number } | null>(null);
  const onCacheRef = useRef(onCacheRouteData);
  const likingRef = useRef<Set<string>>(new Set());

  // Keep refs in sync so callbacks always have the latest values
  logIdRef.current = currentLog?.id;
  const currentLogRef = useRef(currentLog);
  currentLogRef.current = currentLog;
  onCacheRef.current = onCacheRouteData;

  const isCompleted = currentLog?.completed ?? false;
  const isCurrentFlash = currentLog ? isFlash(currentLog) : false;
  const isReadOnly = isCompleted || !set.active;
  const zoneValue = currentLog?.zone ?? false;
  const zoneReadOnly = isCompleted && zoneValue;

  // Use cached data if available, otherwise fetch from server
  useEffect(() => {
    if (cachedData) {
      const { grade, comments: result, likedIds: liked } = cachedData;
      setGradeLabel(grade !== null ? `V${grade} (Community Grade)` : "Ungraded");
      setLikedIds(new Set(liked));
      setComments(result.items);
      setTotalComments(result.totalItems);
      setHasMore(result.page < result.totalPages);
      setNextPage(2);
      setLoadingComments(false);
      return;
    }

    let cancelled = false;
    setLoadingComments(true);

    fetchRouteData(route.id)
      .then((data) => {
        if (cancelled) return;
        const { grade, comments: result, likedIds: liked } = data;
        setGradeLabel(grade !== null ? `V${grade} (Community Grade)` : "Ungraded");
        setLikedIds(new Set(liked));
        setComments(result.items);
        setTotalComments(result.totalItems);
        setHasMore(result.page < result.totalPages);
        setNextPage(2);
        onCacheRef.current?.(route.id, data);
      })
      .catch((err) => console.warn("[chork] fetchRouteData failed:", err))
      .finally(() => {
        if (!cancelled) setLoadingComments(false);
      });

    return () => {
      cancelled = true;
    };
  }, [route.id, cachedData]);

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

  const saveAttempts = useCallback(
    async (value: number) => {
      const result = await updateAttempts(route.id, value, logIdRef.current);
      if ("error" in result) {
        showToast(result.error, "error");
        return;
      }
      setCurrentLog(result.log);
      onLogUpdate(route.id, result.log);
    },
    [route.id, onLogUpdate]
  );

  function changeAttempts(delta: number) {
    if (isReadOnly) return;
    const next = Math.max(0, attempts + delta);
    setAttempts(next);
    pendingAttemptsRef.current = next;

    // Optimistic update — parent tile reflects the new attempt count immediately
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

    if ("vibrate" in navigator) {
      navigator.vibrate(10);
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      pendingAttemptsRef.current = null;
      saveAttempts(next);
    }, 800);
  }

  // Flush pending save on unmount
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

  async function handleUncomplete() {
    const result = await uncompleteRoute(route.id, currentLog?.id);
    if ("error" in result) {
      showToast(result.error, "error");
      return;
    }
    setCurrentLog(result.log);
    setAttempts(result.log.attempts);
    onLogUpdate(route.id, result.log);
    showToast("Completion removed");
  }

  async function handlePostComment() {
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
    } catch (err) {
      console.warn("[chork] postComment failed:", err);
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
    setComments((prev) =>
      prev.map((c) => (c.id === commentId ? result.comment : c))
    );
    setEditingId(null);
    showToast("Comment updated");
  }

  async function handleLike(commentId: string) {
    // Prevent concurrent requests for the same comment
    if (likingRef.current.has(commentId)) return;
    likingRef.current.add(commentId);

    const wasLiked = likedIds.has(commentId);
    const prevCount = comments.find((c) => c.id === commentId)?.likes ?? 0;
    // Optimistic update
    setLikedIds((prev) => {
      const next = new Set(prev);
      if (wasLiked) next.delete(commentId);
      else next.add(commentId);
      return next;
    });
    setComments((prev) =>
      prev.map((c) =>
        c.id === commentId
          ? { ...c, likes: c.likes + (wasLiked ? -1 : 1) }
          : c
      )
    );

    const result = await likeComment(commentId);
    if (result.error) {
      // Revert
      setLikedIds((prev) => {
        const next = new Set(prev);
        if (wasLiked) next.add(commentId);
        else next.delete(commentId);
        return next;
      });
      setComments((prev) =>
        prev.map((c) =>
          c.id === commentId
            ? { ...c, likes: c.likes + (wasLiked ? 1 : -1) }
            : c
        )
      );
      showToast(result.error, "error");
    } else if (result.likes !== undefined) {
      // Only sync if server count differs from our optimistic value
      const expected = prevCount + (wasLiked ? -1 : 1);
      if (result.likes !== expected) {
        setComments((prev) =>
          prev.map((c) =>
            c.id === commentId ? { ...c, likes: result.likes! } : c
          )
        );
      }
    }
    likingRef.current.delete(commentId);
  }

  function handleComplete(updatedLog: RouteLog) {
    // Capture pre-completion state for potential revert
    const prevLog = currentLog;
    const prevAttempts = attempts;
    setCurrentLog(updatedLog);
    setAttempts(updatedLog.attempts);
    onLogUpdate(route.id, updatedLog);
    setShowComplete(false);
    // Store revert data in a ref so the modal's onRevert callback can access it
    preCompleteRef.current = { log: prevLog, attempts: prevAttempts };
  }

  function handleCompleteRevert() {
    const prev = preCompleteRef.current;
    if (!prev) return;
    setCurrentLog(prev.log);
    setAttempts(prev.attempts);
    if (prev.log) {
      onLogUpdate(route.id, prev.log);
    }
    preCompleteRef.current = null;
  }

  async function handleZoneToggle(checked: boolean) {
    // Optimistic update — functional setState avoids stale closures,
    // ref read for onLogUpdate avoids capturing stale currentLog.
    setCurrentLog((prev) => (prev ? { ...prev, zone: checked } : prev));
    const latest = currentLogRef.current;
    if (latest) onLogUpdate(route.id, { ...latest, zone: checked });

    const result = await toggleZone(route.id, checked, logIdRef.current);
    if ("error" in result) {
      showToast(result.error, "error");
      // Revert — functional update reads latest state, not stale closure
      setCurrentLog((prev) => (prev ? { ...prev, zone: !checked } : prev));
    }
  }

  const pointsPreview = getPointsPreview(
    attempts,
    currentLog?.zone ?? false,
    isCompleted,
    currentLog
  );

  function handleDragStart(e: React.PointerEvent) {
    // Only drag from the handle area
    const target = e.target as HTMLElement;
    if (!target.closest(`.${styles.handleBtn}`)) return;

    dragRef.current = { startY: e.clientY, startTime: Date.now(), dragging: true };
    contentRef.current?.setPointerCapture(e.pointerId);
    if (contentRef.current) {
      contentRef.current.style.setProperty("--drag-y", "0px");
      contentRef.current.classList.add(styles.dragging);
    }
  }

  function handleDragMove(e: React.PointerEvent) {
    if (!dragRef.current.dragging || !contentRef.current) return;
    const dy = Math.max(0, e.clientY - dragRef.current.startY);
    contentRef.current.style.setProperty("--drag-y", `${dy}px`);
  }

  function handleDragEnd(e: React.PointerEvent) {
    if (!dragRef.current.dragging || !contentRef.current) return;
    dragRef.current.dragging = false;
    contentRef.current.releasePointerCapture(e.pointerId);

    const dy = e.clientY - dragRef.current.startY;
    const elapsed = Date.now() - dragRef.current.startTime;
    const velocity = elapsed > 0 ? dy / elapsed : 0;

    contentRef.current.classList.remove(styles.dragging);
    contentRef.current.style.removeProperty("--drag-y");

    if (dy > DRAG_CLOSE_THRESHOLD || velocity > DRAG_VELOCITY_THRESHOLD) {
      startClose();
    }
    // Otherwise snaps back automatically via CSS (no inline styles to clean up)
  }

  function startClose() {
    if (closing) return;
    // Flush any pending debounced save before closing
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      if (pendingAttemptsRef.current !== null) {
        saveAttempts(pendingAttemptsRef.current);
        pendingAttemptsRef.current = null;
      }
    }
    setClosing(true);
  }

  return (
    <Dialog.Root open onOpenChange={(open) => !open && startClose()}>
      <Dialog.Portal>
        <Dialog.Overlay
          className={`${styles.overlay} ${closing ? styles.overlayClosing : ""}`}
          onClick={startClose}
        />
        <Dialog.Content
          ref={contentRef}
          className={`${styles.content} ${closing ? styles.contentClosing : ""}`}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
          onPointerDown={handleDragStart}
          onPointerMove={handleDragMove}
          onPointerUp={handleDragEnd}
          onAnimationEnd={() => { if (closing) onClose(); }}
        >
          <VisuallyHidden.Root asChild>
            <Dialog.Title>Route {route.number}</Dialog.Title>
          </VisuallyHidden.Root>

          {/* Handle — tap to close */}
          <button
            type="button"
            className={styles.handleBtn}
            onClick={startClose}
            aria-label="Close"
          >
            <div className={styles.handle} />
          </button>

          <header className={styles.header}>
            <h2 className={styles.routeNumber}>
              {route.number}
              {isCurrentFlash && <FaBolt className={styles.flashIcon} />}
            </h2>
            <div className={styles.gradeRow}>
              <span className={`${styles.communityGrade} ${loadingComments ? shimmerStyles.skeleton : ""}`}>
                {gradeLabel ?? "\u00A0"}
              </span>
              {currentLog?.grade_vote != null && (
                <span className={styles.userGrade}>
                  You voted V{currentLog.grade_vote}
                </span>
              )}
            </div>
          </header>

          {/* Attempt counter */}
          <div className={styles.counter}>
            <span className={styles.counterLabel}>Attempts</span>
            <div className={`${styles.counterControls} ${isCompleted ? styles.counterControlsHidden : ""}`}>
              <button
                className={styles.counterBtn}
                onClick={() => changeAttempts(-1)}
                disabled={isReadOnly || attempts <= 0}
                type="button"
                tabIndex={isCompleted ? -1 : undefined}
                aria-label="Decrease attempts"
              >
                <FaMinus />
              </button>
              <span className={styles.counterValue}>
                <RollingNumber value={attempts} />
              </span>
              <button
                className={styles.counterBtn}
                onClick={() => changeAttempts(1)}
                disabled={isReadOnly}
                type="button"
                tabIndex={isCompleted ? -1 : undefined}
                aria-label="Increase attempts"
              >
                <FaPlus />
              </button>
            </div>
            <span
              className={`${styles.pointsPreview} ${isCompleted ? styles.pointsEarned : ""}`}
            >
              {pointsPreview ?? "\u00A0"}
            </span>
          </div>

          {/* Zone toggle */}
          {route.has_zone && (
            <div
              className={`${styles.zoneRow} ${zoneValue ? styles.zoneRowOn : ""}`}
            >
              <FaBullseye className={styles.zoneIcon} />
              <span className={styles.zoneLabel}>ZONE HOLD</span>
              <Switch.Root
                className={styles.zoneSwitch}
                checked={zoneValue}
                onCheckedChange={handleZoneToggle}
                disabled={zoneReadOnly || !set.active}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <Switch.Thumb className={styles.zoneSwitchThumb} />
              </Switch.Root>
            </div>
          )}

          {/* Complete / Undo */}
          {isCompleted && set.active ? (
            <div className={styles.completedActions}>
              <Button disabled flex>
                {isCurrentFlash ? "Flashed" : "Completed"}
              </Button>
              <Button variant="ghost" onClick={handleUncomplete}>
                Undo
              </Button>
            </div>
          ) : (
            <Button
              onClick={() => setShowComplete(true)}
              disabled={attempts < 1 || !set.active}
              fullWidth
            >
              Mark as complete
            </Button>
          )}

          {/* Beta spray */}
          <div className={styles.betaSection}>
            <div className={styles.betaHeader}>
              <span className={styles.sectionLabel}>BETA SPRAY</span>
              {!isCompleted && !loadingComments && comments.length > 0 ? (
                <button
                  type="button"
                  className={styles.betaToggle}
                  onClick={() => setBetaRevealed((v) => !v)}
                >
                  {betaRevealed ? <FaEyeSlash /> : <FaEye />}
                  <span>{betaRevealed ? "Hide beta" : "Reveal beta"}</span>
                </button>
              ) : !loadingComments && totalComments > 0 ? (
                <span className={styles.commentCount}>
                  {totalComments} comment{totalComments !== 1 ? "s" : ""}
                </span>
              ) : (
                <span className={styles.commentCount}>{"\u00A0"}</span>
              )}
            </div>

            <div className={styles.betaScroll}>
              {loadingComments ? (
                <div className={styles.commentList}>
                  {[0, 1].map((i) => (
                    <div key={i} className={styles.commentRow}>
                      <div className={styles.avatarLink}>
                        <div className={`${styles.commentAvatar} ${shimmerStyles.skeleton}`} />
                      </div>
                      <div className={styles.commentContent}>
                        <span className={`${shimmerStyles.skeletonLine} ${shimmerStyles.skeletonShort}`} />
                        <span className={shimmerStyles.skeletonLine} />
                        <span className={`${shimmerStyles.skeletonLine} ${shimmerStyles.skeletonShort}`} />
                      </div>
                      <div className={styles.actionBtnSpacer} />
                    </div>
                  ))}
                </div>
              ) : comments.length === 0 ? (
              <p className={`${styles.betaEmpty} ${shimmerStyles.fadeIn}`}>No comments yet</p>
            ) : (
              <div
                className={[
                  shimmerStyles.fadeIn,
                  !isCompleted && !betaRevealed ? styles.betaBlurred : "",
                ].filter(Boolean).join(" ")}
              >
                <ul className={styles.commentList}>
                  {(expanded ? comments : comments.slice(0, 2)).map((c) => {
                    const author = c.profiles;
                    const avatarUrl = author
                      ? getAvatarUrl(author, { size: 64 })
                      : undefined;
                    const username = author?.username ?? "unknown";
                    const displayName = author?.name ?? "";
                    const initial = displayName.charAt(0) || username.charAt(0) || "?";
                    const isOwn = user?.id === c.user_id;

                    return (
                      <li key={c.id} className={styles.commentItem}>
                        <div className={styles.commentRow}>
                          <Link
                            href={`/u/${username}`}
                            className={styles.avatarLink}
                          >
                            {avatarUrl ? (
                              <Image
                                src={avatarUrl}
                                alt={`@${username}`}
                                width={32}
                                height={32}
                                className={styles.commentAvatar}
                                unoptimized
                              />
                            ) : (
                              <span className={styles.commentAvatarFallback}>
                                {initial.toUpperCase()}
                              </span>
                            )}
                          </Link>

                          <div className={styles.commentContent}>
                            {editingId === c.id ? (
                              <div className={styles.editForm}>
                                <input
                                  type="text"
                                  className={styles.commentInput}
                                  value={editBody}
                                  onChange={(e) => setEditBody(e.target.value)}
                                  autoFocus
                                />
                                <button
                                  type="button"
                                  className={styles.editConfirm}
                                  onClick={() => handleEditComment(c.id)}
                                  disabled={!editBody.trim()}
                                >
                                  <FaCheck />
                                </button>
                                <button
                                  type="button"
                                  className={styles.editCancel}
                                  onClick={() => setEditingId(null)}
                                >
                                  <FaXmark />
                                </button>
                              </div>
                            ) : (
                              <>
                                <Link
                                  href={`/u/${username}`}
                                  className={styles.commentAuthor}
                                >
                                  @{username}
                                </Link>
                                <p className={styles.commentBody}>{c.body}</p>
                                <span className={styles.commentLikes}>
                                  {c.likes > 0
                                    ? `${c.likes} ${c.likes === 1 ? "like" : "likes"}`
                                    : "\u00A0"}
                                </span>
                              </>
                            )}
                          </div>

                          {isOwn ? (
                            editingId === c.id ? (
                              <div className={styles.actionBtnSpacer} />
                            ) : (
                              <button
                                type="button"
                                className={styles.actionBtn}
                                onClick={() => {
                                  setEditingId(c.id);
                                  setEditBody(c.body);
                                }}
                                aria-label="Edit comment"
                              >
                                <FaPen />
                              </button>
                            )
                          ) : (
                            <button
                              type="button"
                              className={`${styles.actionBtn} ${likedIds.has(c.id) ? styles.likeBtnActive : ""}`}
                              onClick={() => handleLike(c.id)}
                              aria-label={likedIds.has(c.id) ? "Unlike comment" : "Like comment"}
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
                  <button
                    type="button"
                    className={styles.loadMore}
                    onClick={() => setExpanded(true)}
                  >
                    Show {comments.length - 2} more comment{comments.length - 2 !== 1 ? "s" : ""}
                  </button>
                ) : hasMore && (
                  <button
                    type="button"
                    className={styles.loadMore}
                    onClick={loadMore}
                    disabled={loadingMore}
                  >
                    {loadingMore ? "Loading..." : "Load more"}
                  </button>
                )}
              </div>
              )}
            </div>

            {isCompleted && set.active && (
              <form
                className={styles.commentForm}
                onSubmit={(e) => {
                  e.preventDefault();
                  handlePostComment();
                }}
              >
                <input
                  type="text"
                  className={styles.commentInput}
                  placeholder="Share beta..."
                  aria-label="Share beta"
                  value={commentBody}
                  onChange={(e) => setCommentBody(e.target.value)}
                  disabled={posting}
                />
                <button
                  type="submit"
                  className={styles.commentSubmit}
                  disabled={posting || !commentBody.trim()}
                  aria-label="Post comment"
                >
                  <FaPaperPlane />
                </button>
              </form>
            )}

            {!isCompleted && (
              <p className={styles.betaPostHint}>
                Complete this route to post beta.
              </p>
            )}
          </div>

          <button className={styles.closeBtn} type="button" onClick={startClose}>
            Close
          </button>
        </Dialog.Content>
      </Dialog.Portal>

      {showComplete && (
        <CompleteModal
          route={route}
          gymId={set.gym_id}
          attempts={attempts}
          zone={zoneValue}
          logId={currentLog?.id}
          onConfirm={handleComplete}
          onRevert={handleCompleteRevert}
          onCancel={() => setShowComplete(false)}
        />
      )}
    </Dialog.Root>
  );
}
