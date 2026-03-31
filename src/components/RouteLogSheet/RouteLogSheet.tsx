"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as VisuallyHidden from "@radix-ui/react-visually-hidden";
import Link from "next/link";
import { FaMinus, FaPlus, FaEyeSlash, FaEye, FaPaperPlane, FaBolt, FaPen, FaCheck, FaXmark, FaBullseye } from "react-icons/fa6";
import { formatDistanceToNow, parseISO } from "date-fns";
import type { Set, Route, RouteLog, Comment } from "@/lib/data";
import { isFlash } from "@/lib/data";
import { useAuth } from "@/lib/auth-context";
import { getAvatarUrl } from "@/lib/avatar";
import { updateAttempts, uncompleteRoute, toggleZone, postComment, fetchComments, editComment } from "@/app/(app)/actions";
import { Button, showToast } from "@/components/ui";
import { CompleteModal } from "@/components/CompleteModal/CompleteModal";
import styles from "./routeLogSheet.module.scss";

interface Props {
  set: Set;
  route: Route;
  log: RouteLog | null;
  onClose: () => void;
  onLogUpdate: (routeId: string, log: RouteLog) => void;
}

function getStatus(log: RouteLog | null, optimisticAttempts: number): string {
  if (log?.completed) {
    return isFlash(log) ? "Flash" : "Completed";
  }
  if (optimisticAttempts > 0) return "In progress";
  return "Not started";
}

export function RouteLogSheet({ set, route, log, onClose, onLogUpdate }: Props) {
  const { user } = useAuth();
  const [attempts, setAttempts] = useState(log?.attempts ?? 0);
  const [currentLog, setCurrentLog] = useState(log);
  const [showComplete, setShowComplete] = useState(false);
  const [betaRevealed, setBetaRevealed] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentBody, setCommentBody] = useState("");
  const [posting, setPosting] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadingComments, setLoadingComments] = useState(true);
  const [nextPage, setNextPage] = useState(1);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingAttemptsRef = useRef<number | null>(null);
  const isCompleted = currentLog?.completed ?? false;
  const isCurrentFlash = currentLog ? isFlash(currentLog) : false;
  const isReadOnly = isCompleted || !set.active;

  useEffect(() => {
    let cancelled = false;
    setLoadingComments(true);
    fetchComments(route.id, 1).then((result) => {
      if (cancelled) return;
      setComments(result.items);
      setHasMore(result.page < result.totalPages);
      setNextPage(2);
      setLoadingComments(false);
    });
    return () => { cancelled = true; };
  }, [route.id]);

  async function loadMore() {
    const result = await fetchComments(route.id, nextPage);
    setComments((prev) => [...prev, ...result.items]);
    setHasMore(result.page < result.totalPages);
    setNextPage((p) => p + 1);
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

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      pendingAttemptsRef.current = null;
      saveAttempts(next);
    }, 800);
  }

  // Flush pending save on unmount so closing the sheet doesn't lose data
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
    const result = await uncompleteRoute(route.id);
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

  function handleComplete(updatedLog: RouteLog) {
    setCurrentLog(updatedLog);
    setAttempts(updatedLog.attempts);
    onLogUpdate(route.id, updatedLog);
    setShowComplete(false);
  }

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.content}>
          <VisuallyHidden.Root asChild>
            <Dialog.Title>Route {route.number}</Dialog.Title>
          </VisuallyHidden.Root>
          <div className={styles.handle} />

          <header className={styles.header}>
            <h2 className={styles.routeNumber}>
              {route.number}
            </h2>
            <span className={`${styles.status} ${isCurrentFlash ? styles.statusFlash : ""}`}>
              {isCurrentFlash && <FaBolt className={styles.flashIcon} />}
              {getStatus(currentLog, attempts)}
            </span>
          </header>

          <div className={styles.counter}>
            <span className={styles.counterLabel}>Attempts</span>
            <div className={styles.counterControls}>
              <button
                className={styles.counterBtn}
                onClick={() => changeAttempts(-1)}
                disabled={isReadOnly || attempts <= 0}
                type="button"
              >
                <FaMinus />
              </button>
              <span className={styles.counterValue}>{attempts}</span>
              <button
                className={styles.counterBtn}
                onClick={() => changeAttempts(1)}
                disabled={isReadOnly}
                type="button"
              >
                <FaPlus />
              </button>
            </div>
          </div>

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

          {route.has_zone && set.active && (
            <button
              type="button"
              className={`${styles.zoneToggle} ${currentLog?.zone ? styles.zoneToggleOn : ""}`}
              onClick={async () => {
                const next = !(currentLog?.zone ?? false);
                const result = await toggleZone(route.id, next);
                if (result.error) {
                  showToast(result.error, "error");
                  return;
                }
                if (result.log) {
                  setCurrentLog(result.log);
                  onLogUpdate(route.id, result.log);
                }
              }}
            >
              <FaBullseye className={styles.zoneIcon} />
              <span>Zone</span>
              {currentLog?.zone && <span className={styles.zonePts}>+1 pt</span>}
            </button>
          )}

          <div className={styles.betaSection}>
            <div className={styles.betaHeader}>
              <span className={styles.sectionLabel}>Beta spray</span>
              {!isCompleted && !loadingComments && comments.length > 0 && (
                <button
                  type="button"
                  className={styles.betaToggle}
                  onClick={() => setBetaRevealed((v) => !v)}
                >
                  {betaRevealed ? <FaEyeSlash /> : <FaEye />}
                  <span>{betaRevealed ? "Hide" : "Reveal"}</span>
                </button>
              )}
            </div>

            {loadingComments ? (
              <p className={styles.betaEmpty}>Loading...</p>
            ) : comments.length === 0 ? (
              <p className={styles.betaEmpty}>No comments yet</p>
            ) : (
              <div className={!isCompleted && !betaRevealed ? styles.betaBlurred : undefined}>
                <>
                  <ul className={styles.commentList}>
                    {comments.map((c) => {
                      const author = c.expand?.user_id;
                      const avatarUrl = author
                        ? getAvatarUrl(author, { thumb: "64x64" })
                        : undefined;
                      const username = author?.username ?? "unknown";
                      const timeAgo = formatDistanceToNow(parseISO(c.created), { addSuffix: true });

                      return (
                        <li key={c.id} className={styles.commentItem}>
                          <div className={styles.commentRow}>
                            <Link href={`/u/${username}`} className={styles.avatarLink}>
                              {avatarUrl ? (
                                <img
                                  src={avatarUrl}
                                  alt={`@${username}`}
                                  className={styles.commentAvatar}
                                />
                              ) : (
                                <span className={styles.commentAvatarFallback} />
                              )}
                            </Link>
                            <div className={styles.commentContent}>
                              <div className={styles.commentMeta}>
                                <Link href={`/u/${username}`} className={styles.commentAuthor}>
                                  @{username}
                                </Link>
                                <span className={styles.commentTime}>{timeAgo}</span>
                              </div>
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
                                <p className={styles.commentBody}>{c.body}</p>
                              )}
                            </div>
                            {user && c.user_id === user.id && editingId !== c.id && (
                              <button
                                type="button"
                                className={styles.editBtn}
                                onClick={() => {
                                  setEditingId(c.id);
                                  setEditBody(c.body);
                                }}
                              >
                                <FaPen />
                              </button>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                  {hasMore && (
                    <button
                      type="button"
                      className={styles.loadMore}
                      onClick={loadMore}
                    >
                      Load more
                    </button>
                  )}
                </>
              </div>
            )}

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

          <Dialog.Close asChild>
            <button className={styles.closeBtn} type="button">
              Close
            </button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>

      {showComplete && (
        <CompleteModal
          route={route}
          attempts={attempts}
          onConfirm={handleComplete}
          onCancel={() => setShowComplete(false)}
        />
      )}
    </Dialog.Root>
  );
}
