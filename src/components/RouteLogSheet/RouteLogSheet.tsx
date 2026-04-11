"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as VisuallyHidden from "@radix-ui/react-visually-hidden";
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
  FaHeart,
  FaRegHeart,
  FaChevronDown,
  FaArrowRight,
} from "react-icons/fa6";
import type { ReactNode } from "react";
import { RollingNumber } from "@/components/RollingNumber/RollingNumber";
import { ZoneHoldRow } from "./ZoneHoldRow";
import { GradeSlider } from "./GradeSlider";
import type { RouteSet, Route, RouteLog, Comment, PaginatedComments } from "@/lib/data";
import { createOptimisticLog } from "@/lib/data";
import { isFlash, computePoints } from "@/lib/data";
import { useAuth } from "@/lib/auth-context";
import { getAvatarUrl } from "@/lib/avatar";
import {
  updateAttempts,
  completeRoute,
  uncompleteRoute,
  toggleZone,
  postComment,
  fetchComments,
  fetchRouteData,
  editComment,
  likeComment,
  updateGradeVote,
} from "@/app/(app)/actions";
import { Button, shimmerStyles, showToast } from "@/components/ui";
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
const DRAG_VELOCITY_THRESHOLD = 0.4;

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
  const [closing, setClosing] = useState(false);
  const [gradeLabel, setGradeLabel] = useState<string | null>(null);
  const [gradeVote, setGradeVote] = useState<number | null>(log?.grade_vote ?? null);
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
  const pendingAttemptsRef = useRef<number | null>(null);
  const logIdRef = useRef(currentLog?.id);
  const contentRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startY: number; startTime: number; dragging: boolean }>({ startY: 0, startTime: 0, dragging: false });
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
      setGradeLabel(grade !== null ? `V${grade}` : "Ungraded");
      setLikedIds(new Set(liked));
      setComments(result.items);
      setTotalComments(result.totalItems);
      setHasMore(result.page < result.totalPages);
      setNextPage(2);
      setCommentsLoaded(true);
      return;
    }

    // Fetch grade eagerly
    fetchRouteData(route.id)
      .then((data) => {
        const { grade, comments: result, likedIds: liked } = data;
        setGradeLabel(grade !== null ? `V${grade}` : "Ungraded");
        setLikedIds(new Set(liked));
        setComments(result.items);
        setTotalComments(result.totalItems);
        setHasMore(result.page < result.totalPages);
        setNextPage(2);
        setCommentsLoaded(true);
        onCacheRef.current?.(route.id, data);
      })
      .catch((err) => console.warn("[chork] fetchRouteData failed:", err));
  }, [route.id, cachedData]);

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
      setCurrentLog(result.log);
      onLogUpdateRef.current(route.id, result.log);
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
    showToast(attempts === 1 ? "Flash!" : "Route completed");

    const result = await completeRoute(route.id, attempts, gradeVote, zoneValue, currentLog?.id);
    if ("error" in result) {
      showToast(result.error, "error");
      // Revert
      setCurrentLog(log);
      setAttempts(log?.attempts ?? 0);
      if (log) onLogUpdate(route.id, log);
    } else {
      setCurrentLog(result.log);
      onLogUpdate(route.id, result.log);
    }
    setCompleting(false);
  }

  async function handleUncomplete() {
    const result = await uncompleteRoute(route.id, currentLog?.id);
    if ("error" in result) {
      showToast(result.error, "error");
      return;
    }
    setCurrentLog(result.log);
    setAttempts(result.log.attempts);
    setGradeVote(null);
    onLogUpdate(route.id, result.log);
    showToast("Completion removed");
  }

  // ── Zone toggle ──
  async function handleZoneToggle(checked: boolean) {
    setCurrentLog((prev) => (prev ? { ...prev, zone: checked } : prev));
    const latest = currentLogRef.current;
    if (latest) onLogUpdate(route.id, { ...latest, zone: checked });

    const result = await toggleZone(route.id, checked, logIdRef.current);
    if ("error" in result) {
      showToast(result.error, "error");
      setCurrentLog((prev) => (prev ? { ...prev, zone: !checked } : prev));
    }
  }

  // ── Comments ──
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
    if (likingRef.current.has(commentId)) return;
    likingRef.current.add(commentId);

    const wasLiked = likedIds.has(commentId);
    setLikedIds((prev) => {
      const next = new Set(prev);
      wasLiked ? next.delete(commentId) : next.add(commentId);
      return next;
    });
    setComments((prev) =>
      prev.map((c) => c.id === commentId ? { ...c, likes: c.likes + (wasLiked ? -1 : 1) } : c)
    );

    const result = await likeComment(commentId);
    if (result.error) {
      setLikedIds((prev) => {
        const next = new Set(prev);
        wasLiked ? next.add(commentId) : next.delete(commentId);
        return next;
      });
      setComments((prev) =>
        prev.map((c) => c.id === commentId ? { ...c, likes: c.likes + (wasLiked ? 1 : -1) } : c)
      );
      showToast(result.error, "error");
    }
    likingRef.current.delete(commentId);
  }

  // ── Drag to close ──
  function handleDragStart(e: React.PointerEvent) {
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
    if (dy > DRAG_CLOSE_THRESHOLD || velocity > DRAG_VELOCITY_THRESHOLD) startClose();
  }

  function startClose() {
    if (closing) return;
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      if (pendingAttemptsRef.current !== null) {
        saveAttempts(pendingAttemptsRef.current);
        pendingAttemptsRef.current = null;
      }
    }
    setClosing(true);
  }

  // pointsPreview is now rendered inline as a component

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

          {/* Handle */}
          <button type="button" className={styles.handleBtn} onClick={startClose} aria-label="Close">
            <div className={styles.handle} />
          </button>

          {/* ── Header ── */}
          <header className={styles.header}>
            <h2 className={styles.routeNumber}>
              {route.number}
              {isCurrentFlash && <FaBolt className={styles.flashIcon} />}
            </h2>
            <span className={styles.communityGrade}>
              {gradeLabel ?? "\u00A0"}
            </span>
            {currentLog?.grade_vote != null && (
              <span className={styles.userGrade}>You voted V{currentLog.grade_vote}</span>
            )}
          </header>

          {/* ── Attempt counter (hero) ── */}
          <div className={styles.counter}>
            <span className={styles.counterLabel}>Attempts</span>
            <div className={styles.counterControls}>
              <button
                className={styles.counterBtn}
                onClick={() => changeAttempts(-1)}
                disabled={isCompleted || !set.active || attempts <= 0}
                type="button"
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
                disabled={isCompleted || !set.active}
                type="button"
                aria-label="Increase attempts"
              >
                <FaPlus />
              </button>
            </div>
            <span className={`${styles.pointsPreview} ${isCompleted ? styles.pointsEarned : ""}`}>
              <PointsPreview attempts={attempts} zone={zoneValue} completed={isCompleted} log={currentLog} />
            </span>
          </div>

          {/* ── Secondary controls ── */}
          <div className={styles.controls}>
            {/* Zone hold */}
            {route.has_zone && (
              <ZoneHoldRow
                checked={zoneValue}
                onCheckedChange={handleZoneToggle}
                disabled={isCompleted && zoneValue}
                hasAttempts={attempts > 0}
              />
            )}

            {/* Complete / Undo */}
            {isCompleted && set.active ? (
              <div className={styles.completedRow}>
                <span className={`${styles.completedBadge} ${isCurrentFlash ? styles.completedFlash : ""}`}>
                  {isCurrentFlash ? (
                    <><FaBolt className={styles.completedIcon} /> Flashed</>
                  ) : (
                    <><FaCheck className={styles.completedIcon} /> Sent</>
                  )}
                </span>
                <Button variant="ghost" onClick={handleUncomplete}>Undo</Button>
              </div>
            ) : (
              <Button
                onClick={handleMarkComplete}
                disabled={attempts < 1 || !set.active || completing}
                fullWidth
              >
                {completing ? "Saving..." : "Mark as complete"}
              </Button>
            )}

            {/* Grade slider (post-completion only) */}
            {isCompleted && (
              <GradeSlider
                value={gradeVote}
                onChange={async (grade) => {
                  setGradeVote(grade);
                  if (currentLog?.id) {
                    const result = await updateGradeVote(route.id, grade, currentLog.id);
                    if ("error" in result) {
                      showToast(result.error, "error");
                    } else {
                      setCurrentLog(result.log);
                      onLogUpdateRef.current(route.id, result.log);
                    }
                  }
                }}
              />
            )}
          </div>

          {/* ── Beta spray (collapsible) ── */}
          <div className={styles.betaSection}>
            <button
              type="button"
              className={styles.betaToggleBtn}
              onClick={handleExpandBeta}
            >
              <span className={styles.sectionLabel}>
                BETA SPRAY
                {totalComments > 0 && ` (${totalComments})`}
              </span>
              <FaChevronDown className={`${styles.betaChevron} ${betaExpanded ? styles.betaChevronOpen : ""}`} />
            </button>

            {betaExpanded && (
              <div className={styles.betaContent}>
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
                        </div>
                      </div>
                    ))}
                  </div>
                ) : comments.length === 0 ? (
                  <p className={styles.betaEmpty}>No comments yet</p>
                ) : (
                  <div className={!isCompleted && !betaRevealed ? styles.betaBlurred : ""}>
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
                    <ul className={styles.commentList}>
                      {(expanded ? comments : comments.slice(0, 2)).map((c) => {
                        const author = c.profiles;
                        const avatarUrl = author ? getAvatarUrl(author, { size: 64 }) : undefined;
                        const username = author?.username ?? "unknown";
                        const displayName = author?.name ?? "";
                        const initial = displayName.charAt(0) || username.charAt(0) || "?";
                        const isOwn = user?.id === c.user_id;

                        return (
                          <li key={c.id} className={styles.commentItem}>
                            <div className={styles.commentRow}>
                              <Link href={`/u/${username}`} className={styles.avatarLink}>
                                {avatarUrl ? (
                                  <Image src={avatarUrl} alt={`@${username}`} width={32} height={32} className={styles.commentAvatar} unoptimized />
                                ) : (
                                  <span className={styles.commentAvatarFallback}>{initial.toUpperCase()}</span>
                                )}
                              </Link>
                              <div className={styles.commentContent}>
                                {editingId === c.id ? (
                                  <div className={styles.editForm}>
                                    <input type="text" className={styles.commentInput} value={editBody} onChange={(e) => setEditBody(e.target.value)} autoFocus />
                                    <button type="button" className={styles.editConfirm} onClick={() => handleEditComment(c.id)} disabled={!editBody.trim()}><FaCheck /></button>
                                    <button type="button" className={styles.editCancel} onClick={() => setEditingId(null)}><FaXmark /></button>
                                  </div>
                                ) : (
                                  <>
                                    <Link href={`/u/${username}`} className={styles.commentAuthor}>@{username}</Link>
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
                )}

                {isCompleted && set.active && (
                  <form className={styles.commentForm} onSubmit={(e) => { e.preventDefault(); handlePostComment(); }}>
                    <input
                      type="text"
                      className={styles.commentInput}
                      placeholder="Share beta..."
                      aria-label="Share beta"
                      value={commentBody}
                      onChange={(e) => setCommentBody(e.target.value)}
                      disabled={posting}
                    />
                    <button type="submit" className={styles.commentSubmit} disabled={posting || !commentBody.trim()} aria-label="Post comment">
                      <FaPaperPlane />
                    </button>
                  </form>
                )}

                {!isCompleted && (
                  <p className={styles.betaPostHint}>Complete this route to post beta.</p>
                )}
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
