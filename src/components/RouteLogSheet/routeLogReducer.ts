import type { Comment, PaginatedComments, RouteLog } from "@/lib/data";
import type { GradingScale } from "@/lib/data/grade-label";
import { formatGrade } from "@/lib/data/grade-label";
import type { CachedRouteData } from "./types";

/**
 * Local state model for the route-log bottom-sheet. Modelled on
 * `jamScreenReducer.ts` — discriminated-union actions, pure
 * transitions, immutable updates. Unit-tested independently of any
 * React render.
 *
 * Split rationale: the orchestrator used to own 14 sibling useState
 * fields, several of which had to mutate together (toggle-like
 * flipping `likedIds` AND `comments[i].likes`; mark-complete
 * snapshot + revert; hydrate-route-data populating grade + comments
 * + likedIds in one shot). Centralising those into named actions
 * makes the state machine legible and the invariants testable.
 */
export interface RouteLogState {
  // ── Log + attempts + grade ──────────────────────
  attempts: number;
  currentLog: RouteLog | null;
  /** null = grade still loading; "Ungraded" = loaded but no community grade yet. */
  gradeLabel: string | null;
  gradeVote: number | null;
  /** True while the mark-complete server call is in flight. */
  completing: boolean;

  // ── Beta-spray drawer ──────────────────────────
  betaExpanded: boolean;

  // ── Comment thread data (drives <CommentThread />) ──
  comments: Comment[];
  hasMore: boolean;
  loadingComments: boolean;
  loadingMore: boolean;
  nextPage: number;
  totalComments: number;
  commentsLoaded: boolean;
  likedIds: Set<string>;
}

export type RouteLogAction =
  // attempts + log
  | { type: "set-attempts"; attempts: number }
  | { type: "patch-log"; patch: Partial<RouteLog>; attempts?: number }
  | { type: "set-log"; log: RouteLog | null }
  | {
      type: "revert-log";
      log: RouteLog | null;
      attempts: number;
      gradeVote: number | null;
    }
  // completion lifecycle
  | { type: "begin-complete" }
  | { type: "end-complete" }
  // grade
  | { type: "set-grade-label"; label: string | null }
  | { type: "set-grade-vote"; vote: number | null }
  // beta + comments
  | { type: "toggle-beta" }
  | { type: "set-loading-comments"; loading: boolean }
  | { type: "set-loading-more"; loading: boolean }
  | {
      type: "hydrate-route-data";
      data: CachedRouteData;
      gradingScale: GradingScale;
    }
  /**
   * Lazy comment-only seed for the case where the beta drawer is
   * opened before any cached/fetched data has populated the comment
   * list. Touches comment fields only — does NOT mutate gradeLabel
   * or likedIds (those come from hydrate-route-data).
   */
  | { type: "seed-comments"; result: PaginatedComments }
  | { type: "append-comments"; result: PaginatedComments }
  | { type: "prepend-comment"; comment: Comment }
  | { type: "replace-comment"; comment: Comment }
  /**
   * Atomically flip the liked-state for a comment AND adjust its
   * cached likes count. Caller passes the *new* liked state — the
   * reducer applies +1 / -1 to the count accordingly. Idempotent
   * when the same toggle pair fires twice (used by the revert path).
   */
  | { type: "toggle-like"; commentId: string; liked: boolean };

/** Build the initial state from the props that mount the sheet. */
export function initialRouteLogState(log: RouteLog | null): RouteLogState {
  return {
    attempts: log?.attempts ?? 0,
    currentLog: log,
    gradeLabel: null,
    gradeVote: log?.grade_vote ?? null,
    completing: false,
    betaExpanded: false,
    comments: [],
    hasMore: false,
    loadingComments: false,
    loadingMore: false,
    nextPage: 1,
    totalComments: 0,
    commentsLoaded: false,
    likedIds: new Set(),
  };
}

export function routeLogReducer(
  state: RouteLogState,
  action: RouteLogAction,
): RouteLogState {
  switch (action.type) {
    case "set-attempts":
      return { ...state, attempts: action.attempts };

    case "patch-log": {
      // No-op when there's nothing to patch — the orchestrator should
      // use `set-log` (with createOptimisticLog) to materialise the
      // first log row instead of fabricating one inside the reducer.
      if (state.currentLog === null) return state;
      const nextLog = { ...state.currentLog, ...action.patch };
      return {
        ...state,
        currentLog: nextLog,
        attempts: action.attempts ?? state.attempts,
      };
    }

    case "set-log":
      return { ...state, currentLog: action.log };

    case "revert-log":
      return {
        ...state,
        currentLog: action.log,
        attempts: action.attempts,
        gradeVote: action.gradeVote,
      };

    case "begin-complete":
      return { ...state, completing: true };

    case "end-complete":
      return { ...state, completing: false };

    case "set-grade-label":
      return { ...state, gradeLabel: action.label };

    case "set-grade-vote":
      return { ...state, gradeVote: action.vote };

    case "toggle-beta":
      return { ...state, betaExpanded: !state.betaExpanded };

    case "set-loading-comments":
      return { ...state, loadingComments: action.loading };

    case "set-loading-more":
      return { ...state, loadingMore: action.loading };

    case "hydrate-route-data": {
      const { data, gradingScale } = action;
      const label =
        data.grade !== null
          ? (formatGrade(data.grade, gradingScale) ?? "Ungraded")
          : "Ungraded";
      return {
        ...state,
        gradeLabel: label,
        likedIds: new Set(data.likedIds),
        comments: data.comments.items,
        totalComments: data.comments.totalItems,
        hasMore: data.comments.page < data.comments.totalPages,
        nextPage: 2,
        commentsLoaded: true,
      };
    }

    case "seed-comments": {
      const { result } = action;
      return {
        ...state,
        comments: result.items,
        totalComments: result.totalItems,
        hasMore: result.page < result.totalPages,
        nextPage: 2,
        commentsLoaded: true,
      };
    }

    case "append-comments": {
      const { result } = action;
      return {
        ...state,
        comments: [...state.comments, ...result.items],
        totalComments: result.totalItems,
        hasMore: result.page < result.totalPages,
        nextPage: state.nextPage + 1,
      };
    }

    case "prepend-comment":
      return {
        ...state,
        comments: [action.comment, ...state.comments],
        totalComments: state.totalComments + 1,
      };

    case "replace-comment":
      return {
        ...state,
        comments: state.comments.map((c) =>
          c.id === action.comment.id ? action.comment : c,
        ),
      };

    case "toggle-like": {
      const liked = action.liked;
      const nextLiked = new Set(state.likedIds);
      if (liked) nextLiked.add(action.commentId);
      else nextLiked.delete(action.commentId);
      // Mirror the count change on the cached comment row so the
      // UI heart + count stay in lockstep.
      const delta = liked ? 1 : -1;
      return {
        ...state,
        likedIds: nextLiked,
        comments: state.comments.map((c) =>
          c.id === action.commentId ? { ...c, likes: c.likes + delta } : c,
        ),
      };
    }

    default: {
      // Exhaustiveness check — TS errors if a new action type is
      // added without a matching case.
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}
