"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import {
  FaChevronDown,
  FaEye,
  FaEyeSlash,
  FaHeart,
  FaPaperPlane,
  FaPen,
  FaRegHeart,
} from "react-icons/fa6";
import { EditCommentForm } from "./EditCommentForm";
import { shimmerStyles, showToast, UserAvatar } from "@/components/ui";
import type { Comment } from "@/lib/data";
import styles from "./routeLogSheet.module.scss";

interface Props {
  /** Owner of the sheet — used to detect "own comments". */
  userId: string | undefined;
  /** When false, the post form + reveal toggle behave differently. */
  isCompleted: boolean;
  /** When false, the post form is hidden (set is archived/draft). */
  setActive: boolean;
  /**
   * Controlled drawer open state — parent owns this because the
   * BottomSheet height depends on it.
   */
  betaExpanded: boolean;
  onToggleBetaExpanded: () => void;

  /** Loaded comment data from the parent's fetch. */
  comments: Comment[];
  totalComments: number;
  hasMore: boolean;
  loadingComments: boolean;
  loadingMore: boolean;
  /** Set of comment ids the viewer has liked — owned by parent. */
  likedIds: Set<string>;
  /** When true, the parent has fully resolved the initial fetch. */
  commentsLoaded: boolean;

  /** Fetch the next page of comments. Parent appends to its array. */
  onLoadMore: () => void;
  /** Returns success — child uses it to clear the input on ok. */
  onPostComment: (body: string) => Promise<boolean>;
  /** Returns success — child uses it to close the edit form on ok. */
  onEditComment: (commentId: string, body: string) => Promise<boolean>;
  /** Fire-and-forget like toggle. Parent handles optimistic UI. */
  onLikeComment: (commentId: string) => void;
}

/**
 * Beta-spray drawer + post form for a single route's RouteLogSheet.
 *
 * Owns *local* UI state only — input draft, post-pending flag,
 * which row is being edited, edit draft, "show more" expansion, and
 * blur-reveal toggle. Data state (comments array, like set, loading
 * flags) and the betaExpanded toggle stay with the parent so the
 * BottomSheet can size on `betaExpanded` and post/edit/like results
 * flow back into the shared cache.
 *
 * Pulled out of the 740-LOC RouteLogSheet orchestrator so comment
 * bugs touch one file. See ADR / docs/architecture.md (or git
 * history if not yet documented).
 */
export function CommentThread({
  userId,
  isCompleted,
  setActive,
  betaExpanded,
  onToggleBetaExpanded,
  comments,
  totalComments,
  hasMore,
  loadingComments,
  loadingMore,
  likedIds,
  commentsLoaded,
  onLoadMore,
  onPostComment,
  onEditComment,
  onLikeComment,
}: Props) {
  const [commentBody, setCommentBody] = useState("");
  const [posting, setPosting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [betaRevealed, setBetaRevealed] = useState(false);

  const hasOwnComment = !!userId && comments.some((c) => c.user_id === userId);
  const noComments = totalComments === 0;
  // Gate post-form visibility on commentsReady so the form doesn't pop
  // in after the sheet's first paint — see the historical comment in
  // RouteLogSheet for the regression this prevents.
  const commentsReady = commentsLoaded && !loadingComments;
  // Deliberately NOT gated on betaExpanded: the natural flow is
  // "read the existing beta, then add yours" — hiding the form the
  // moment the drawer opened forced a collapse-first detour.
  const showPostForm =
    commentsReady && isCompleted && setActive && !hasOwnComment;

  async function handlePostSubmit() {
    if (!navigator.onLine) {
      showToast("You're offline — comments available when you reconnect", "info");
      return;
    }
    const trimmed = commentBody.trim();
    if (!trimmed) return;
    setPosting(true);
    const ok = await onPostComment(trimmed);
    setPosting(false);
    if (ok) {
      setCommentBody("");
      showToast("Beta posted");
    }
  }

  async function handleEditSubmit(commentId: string) {
    const trimmed = editBody.trim();
    if (!trimmed) return;
    const original = comments.find((c) => c.id === commentId);
    if (original && original.body === trimmed) {
      setEditingId(null);
      return;
    }
    const ok = await onEditComment(commentId, trimmed);
    if (ok) {
      setEditingId(null);
      showToast("Comment updated");
    }
  }

  return (
    <>
      <div className={styles.betaSection}>
        <button
          type="button"
          className={styles.betaToggleBtn}
          onClick={onToggleBetaExpanded}
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
            <FaChevronDown
              className={`${styles.betaChevron} ${betaExpanded ? styles.betaChevronOpen : ""}`}
            />
          )}
        </button>

        <div
          className={`${styles.betaDrawer} ${betaExpanded ? styles.betaDrawerOpen : ""}`}
          aria-hidden={!betaExpanded}
        >
          <div className={styles.betaDrawerInner}>
            <div className={styles.betaContent}>
              {loadingComments ? (
                <CommentSkeletons />
              ) : comments.length === 0 ? (
                <p className={styles.betaEmpty}>No comments yet</p>
              ) : (
                <div className={styles.betaRegion}>
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
                      {(expanded ? comments : comments.slice(0, 2)).map((c) => (
                        <CommentRow
                          key={c.id}
                          comment={c}
                          isOwn={userId === c.user_id}
                          liked={likedIds.has(c.id)}
                          isEditing={editingId === c.id}
                          editBody={editBody}
                          onStartEdit={() => {
                            setEditingId(c.id);
                            setEditBody(c.body);
                          }}
                          onCancelEdit={() => setEditingId(null)}
                          onChangeEditBody={setEditBody}
                          onSubmitEdit={() => handleEditSubmit(c.id)}
                          onLike={() => onLikeComment(c.id)}
                        />
                      ))}
                    </ul>
                    {!expanded && comments.length > 2 ? (
                      <button
                        type="button"
                        className={styles.loadMore}
                        onClick={() => setExpanded(true)}
                      >
                        Show {comments.length - 2} more
                      </button>
                    ) : (
                      hasMore && (
                        <button
                          type="button"
                          className={styles.loadMore}
                          onClick={onLoadMore}
                          disabled={loadingMore}
                        >
                          {loadingMore ? "Loading..." : "Load more"}
                        </button>
                      )
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
          <form
            className={styles.commentForm}
            onSubmit={(e) => {
              e.preventDefault();
              handlePostSubmit();
            }}
          >
            <input
              type="text"
              className={styles.commentInput}
              placeholder="Share beta..."
              aria-label="Share beta"
              value={commentBody}
              onChange={(e) => setCommentBody(e.target.value)}
              disabled={posting || !showPostForm}
              tabIndex={showPostForm ? 0 : -1}
              // Server rejects >500 chars (comment-actions) — stop the
              // climber at the same bound instead of erroring on post.
              maxLength={500}
              enterKeyHint="send"
              autoComplete="off"
              autoCapitalize="sentences"
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
}

function CommentSkeletons(): ReactNode {
  return (
    <div
      className={styles.commentList}
      role="status"
      aria-busy="true"
      aria-label="Loading beta spray"
    >
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
  );
}

interface CommentRowProps {
  comment: Comment;
  isOwn: boolean;
  liked: boolean;
  isEditing: boolean;
  editBody: string;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onChangeEditBody: (body: string) => void;
  onSubmitEdit: () => void;
  onLike: () => void;
}

function CommentRow({
  comment: c,
  isOwn,
  liked,
  isEditing,
  editBody,
  onStartEdit,
  onCancelEdit,
  onChangeEditBody,
  onSubmitEdit,
  onLike,
}: CommentRowProps) {
  const author = c.profiles;
  const username = author?.username ?? "unknown";

  return (
    <li className={styles.commentItem}>
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
          {/* Render the author line in BOTH modes so the row height
              doesn't collapse during edit — prevents sibling rows
              shifting. */}
          <Link href={`/u/${username}`} className={styles.commentAuthor}>
            @{username}
          </Link>
          {isEditing ? (
            <EditCommentForm
              initialBody={editBody}
              onChange={onChangeEditBody}
              onSubmit={onSubmitEdit}
              onCancel={onCancelEdit}
            />
          ) : (
            <>
              <p className={styles.commentBody}>{c.body}</p>
              {c.likes > 0 && (
                <span className={styles.commentLikes}>
                  {c.likes} {c.likes === 1 ? "like" : "likes"}
                </span>
              )}
            </>
          )}
        </div>
        {isOwn ? (
          !isEditing && (
            <button
              type="button"
              className={styles.actionBtn}
              onClick={onStartEdit}
              aria-label="Edit comment"
            >
              <FaPen />
            </button>
          )
        ) : (
          <button
            type="button"
            className={`${styles.actionBtn} ${liked ? styles.likeBtnActive : ""}`}
            onClick={onLike}
            aria-label={liked ? "Unlike" : "Like"}
          >
            {liked ? <FaHeart /> : <FaRegHeart />}
          </button>
        )}
      </div>
    </li>
  );
}
