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
import type { Set as RouteSet, Route, RouteLog, Comment } from "@/lib/data";
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
import { Button, showToast } from "@/components/ui";
import { CompleteModal } from "@/components/CompleteModal/CompleteModal";
import styles from "./routeLogSheet.module.scss";

interface Props {
  set: RouteSet;
  route: Route;
  log: RouteLog | null;
  onClose: () => void;
  onLogUpdate: (routeId: string, log: RouteLog) => void;
}

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

export function RouteLogSheet({ set, route, log, onClose, onLogUpdate }: Props) {
  const { user } = useAuth();
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
  const [expanded, setExpanded] = useState(false);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingAttemptsRef = useRef<number | null>(null);

  const isCompleted = currentLog?.completed ?? false;
  const isCurrentFlash = currentLog ? isFlash(currentLog) : false;
  const isReadOnly = isCompleted || !set.active;
  const zoneValue = currentLog?.zone ?? false;
  const zoneReadOnly = isCompleted && zoneValue;

  // Fetch grade + comments in one server action (avoids Next.js serialization)
  useEffect(() => {
    let cancelled = false;
    setLoadingComments(true);

    fetchRouteData(route.id)
      .then(({ grade, comments: result, likedIds: liked }) => {
        if (cancelled) return;
        if (grade !== null) setGradeLabel(`V${grade} community grade`);
        setLikedIds(new Set(liked));
        setComments(result.items);
        setHasMore(result.page < result.totalPages);
        setNextPage(2);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingComments(false);
      });

    return () => {
      cancelled = true;
    };
  }, [route.id]);

  async function loadMore() {
    setLoadingMore(true);
    try {
      const result = await fetchComments(route.id, nextPage);
      setComments((prev) => [...prev, ...result.items]);
      setHasMore(result.page < result.totalPages);
      setNextPage((p) => p + 1);
      setExpanded(true);
    } finally {
      setLoadingMore(false);
    }
  }

  const saveAttempts = useCallback(
    async (value: number) => {
      const result = await updateAttempts(route.id, value, currentLog?.id);
      if (result.error) {
        showToast(result.error, "error");
        return;
      }
      if (result.log) {
        setCurrentLog(result.log);
        onLogUpdate(route.id, result.log);
      }
    },
    [route.id, currentLog?.id, onLogUpdate]
  );

  function changeAttempts(delta: number) {
    if (isReadOnly) return;
    const next = Math.max(0, attempts + delta);
    setAttempts(next);
    pendingAttemptsRef.current = next;

    // Optimistic update — parent tile reflects the new attempt count immediately
    const optimisticLog: RouteLog = currentLog
      ? { ...currentLog, attempts: next }
      : {
          id: "",
          user_id: user?.id ?? "",
          route_id: route.id,
          attempts: next,
          completed: false,
          completed_at: null,
          grade_vote: null,
          zone: false,
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
        };
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
    if (result.error) {
      showToast(result.error, "error");
      return;
    }
    if (result.log) {
      setCurrentLog(result.log);
      setAttempts(result.log.attempts);
      onLogUpdate(route.id, result.log);
      showToast("Completion removed");
    }
  }

  async function handlePostComment() {
    const trimmed = commentBody.trim();
    if (!trimmed) return;
    setPosting(true);
    try {
      const result = await postComment(route.id, trimmed);
      if (result.error) {
        showToast(result.error, "error");
        return;
      }
      if (result.comment) {
        setComments((prev) => [result.comment!, ...prev]);
        setCommentBody("");
        showToast("Beta posted");
      }
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
    if (result.error) {
      showToast(result.error, "error");
      return;
    }
    if (result.comment) {
      setComments((prev) =>
        prev.map((c) => (c.id === commentId ? result.comment! : c))
      );
      setEditingId(null);
      showToast("Comment updated");
    }
  }

  async function handleLike(commentId: string) {
    const wasLiked = likedIds.has(commentId);
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
      // Sync with authoritative server count
      setComments((prev) =>
        prev.map((c) =>
          c.id === commentId ? { ...c, likes: result.likes! } : c
        )
      );
    }
  }

  function handleComplete(updatedLog: RouteLog) {
    setCurrentLog(updatedLog);
    setAttempts(updatedLog.attempts);
    onLogUpdate(route.id, updatedLog);
    setShowComplete(false);
  }

  async function handleZoneToggle(checked: boolean) {
    // Optimistic update
    setCurrentLog((prev) => (prev ? { ...prev, zone: checked } : prev));
    if (currentLog) {
      onLogUpdate(route.id, { ...currentLog, zone: checked });
    }

    const result = await toggleZone(route.id, checked, currentLog?.id);
    if (result.error) {
      showToast(result.error, "error");
      // Revert
      setCurrentLog((prev) => (prev ? { ...prev, zone: !checked } : prev));
      return;
    }
    if (result.log) {
      setCurrentLog(result.log);
      onLogUpdate(route.id, result.log);
    }
  }

  const pointsPreview = getPointsPreview(
    attempts,
    currentLog?.zone ?? false,
    isCompleted,
    currentLog
  );

  function startClose() {
    if (!closing) setClosing(true);
  }

  return (
    <Dialog.Root open onOpenChange={(open) => !open && startClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className={`${styles.overlay} ${closing ? styles.overlayClosing : ""}`} />
        <Dialog.Content
          className={`${styles.content} ${closing ? styles.contentClosing : ""}`}
          onOpenAutoFocus={(e) => e.preventDefault()}
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
            <span className={styles.communityGrade}>
              {gradeLabel ?? "\u00A0"}
            </span>
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
              ) : !loadingComments && comments.length > 0 ? (
                <span className={styles.commentCount}>
                  {comments.length} comment{comments.length !== 1 ? "s" : ""}
                </span>
              ) : null}
            </div>

            <div className={styles.betaScroll}>
            {loadingComments ? (
              <p className={styles.betaLoading}>Loading...</p>
            ) : comments.length === 0 ? (
              <p className={styles.betaEmpty}>No comments yet</p>
            ) : (
              <div
                className={
                  !isCompleted && !betaRevealed ? styles.betaBlurred : undefined
                }
              >
                <ul className={styles.commentList}>
                  {(expanded ? comments : comments.slice(0, 2)).map((c) => {
                    const author = c.expand?.user_id;
                    const avatarUrl = author
                      ? getAvatarUrl(author, { thumb: "64x64" })
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
                                {c.likes > 0 && (
                                  <span className={styles.commentLikes}>
                                    {c.likes} {c.likes === 1 ? "like" : "likes"}
                                  </span>
                                )}
                              </>
                            )}
                          </div>

                          {editingId !== c.id && (
                            isOwn ? (
                              <button
                                type="button"
                                className={styles.actionBtn}
                                onClick={() => {
                                  setEditingId(c.id);
                                  setEditBody(c.body);
                                }}
                              >
                                <FaPen />
                              </button>
                            ) : (
                              <button
                                type="button"
                                className={`${styles.actionBtn} ${likedIds.has(c.id) ? styles.likeBtnActive : ""}`}
                                onClick={() => handleLike(c.id)}
                              >
                                {likedIds.has(c.id) ? <FaHeart /> : <FaRegHeart />}
                              </button>
                            )
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
                  value={commentBody}
                  onChange={(e) => setCommentBody(e.target.value)}
                  disabled={posting}
                />
                <button
                  type="submit"
                  className={styles.commentSubmit}
                  disabled={posting || !commentBody.trim()}
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
          attempts={attempts}
          zone={zoneValue}
          logId={currentLog?.id}
          onConfirm={handleComplete}
          onCancel={() => setShowComplete(false)}
        />
      )}
    </Dialog.Root>
  );
}
