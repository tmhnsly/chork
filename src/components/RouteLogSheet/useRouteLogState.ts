"use client";

import { useEffect, useReducer, useRef } from "react";
import { showToast, showAchievementToast } from "@/components/ui";
import { pickSendMessage } from "@/lib/send-messages";
import { createOptimisticLog, isFlash } from "@/lib/data";
import type { Route, RouteLog, RouteSet } from "@/lib/data";
import {
  formatGrade,
  type GradingScale,
} from "@/lib/data/grade-label";
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
import { useDebouncedFlush } from "@/hooks/use-debounced-flush";
import { logger } from "@/lib/logger";
import { formatErrorForLog } from "@/lib/errors";
import {
  initialRouteLogState,
  routeLogReducer,
  type RouteLogState,
} from "./routeLogReducer";
import type { CachedRouteData } from "./types";

const ATTEMPTS_DEBOUNCE_MS = 800;
const GRADE_DEBOUNCE_MS = 600;

interface Args {
  set: RouteSet;
  route: Route;
  log: RouteLog | null;
  cachedData?: CachedRouteData;
  userId: string | undefined;
  onLogUpdate: (routeId: string, log: RouteLog) => void;
  onCacheRouteData?: (routeId: string, data: CachedRouteData) => void;
}

export interface UseRouteLogState {
  state: RouteLogState;
  /** Derived flags the orchestrator reads to drive conditional UI. */
  isCompleted: boolean;
  isCurrentFlash: boolean;
  zoneValue: boolean;
  /** UI event handlers — pass straight through to the JSX. */
  changeAttempts: (next: number) => void;
  handleMarkComplete: () => Promise<void>;
  handleUncomplete: () => Promise<void>;
  handleZoneToggle: (checked: boolean) => Promise<void>;
  handleGradeVote: (vote: number | null) => void;
  handleExpandBeta: () => void;
  loadMore: () => Promise<void>;
  onPostComment: (body: string) => Promise<boolean>;
  onEditComment: (commentId: string, body: string) => Promise<boolean>;
  onLikeComment: (commentId: string) => Promise<void>;
}

/**
 * State + handlers for the route-log bottom-sheet. Pairs the pure
 * `routeLogReducer` with two `useDebouncedFlush` instances (attempts +
 * grade vote), the necessary "latest props" refs for async/timer
 * callbacks, and per-action handlers that translate user intent
 * into reducer dispatch + server calls.
 *
 * The orchestrator (`RouteLogSheet.tsx`) is purely the JSX tree and
 * the conditional grade-label subline ladder — every piece of state
 * + every async side effect lives here.
 */
export function useRouteLogState({
  set,
  route,
  log,
  cachedData,
  userId,
  onLogUpdate,
  onCacheRouteData,
}: Args): UseRouteLogState {
  const gradingScale = (set.grading_scale ?? "v") as GradingScale;

  const [state, dispatch] = useReducer(
    routeLogReducer,
    log,
    initialRouteLogState,
  );

  // ── Latest-value refs for async/timer/cleanup ───────
  // The reducer + dispatch wire most paths cleanly, but external props
  // (callbacks the parent owns) still need ref mirrors so we capture
  // the freshest version inside async handlers and timer-flush
  // callbacks. Commit-phase write avoids `react-hooks/refs` lint flag.
  const onLogUpdateRef = useRef(onLogUpdate);
  const onCacheRef = useRef(onCacheRouteData);
  const stateRef = useRef(state);
  const logIdRef = useRef<string | undefined>(state.currentLog?.id);
  useEffect(() => {
    onLogUpdateRef.current = onLogUpdate;
    onCacheRef.current = onCacheRouteData;
    stateRef.current = state;
    logIdRef.current = state.currentLog?.id;
  });

  // Per-comment-id like dedupe — prevents two rapid taps on the same
  // heart from firing duplicate server requests.
  const likingRef = useRef<Set<string>>(new Set());
  // Staggered badge-toast timers, cancelled on unmount so orphaned
  // toasts don't appear after the sheet has closed.
  const badgeToastTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  // Zone toggle is async + dedup-guarded so a double-tap doesn't fire
  // two concurrent server updates.
  const zoningRef = useRef(false);

  // ── Debounced flushers ──────────────────────────────
  // Attempts: debounced server save. The flush callback reads the
  // LATEST log id via ref (since the server may have minted one
  // mid-debounce) and dispatches the server's authoritative log back
  // into local state on success.
  const attemptsFlush = useDebouncedFlush<number>({
    delayMs: ATTEMPTS_DEBOUNCE_MS,
    flush: async (value) => {
      const result = await updateAttempts(route.id, value, logIdRef.current);
      if ("error" in result) {
        showToast(result.error, "error");
        return;
      }
      if (result.log) {
        dispatch({ type: "set-log", log: result.log });
        onLogUpdateRef.current(route.id, result.log);
      }
    },
  });

  // Grade vote: debounced. After the save, refetch the community
  // grade so the displayed label reflects the new average.
  const gradeFlush = useDebouncedFlush<number | null>({
    delayMs: GRADE_DEBOUNCE_MS,
    flush: async (vote) => {
      const logId = logIdRef.current;
      if (!logId) return;
      const result = await updateGradeVote(route.id, vote, logId);
      if ("error" in result) {
        showToast(result.error, "error");
        return;
      }
      if (result.log) {
        dispatch({ type: "set-log", log: result.log });
        onLogUpdateRef.current(route.id, result.log);
      }
      try {
        const fresh = await fetchRouteData(route.id);
        const label =
          fresh.grade !== null
            ? (formatGrade(fresh.grade, gradingScale) ?? "Ungraded")
            : "Ungraded";
        dispatch({ type: "set-grade-label", label });
        onCacheRef.current?.(route.id, fresh);
      } catch (err) {
        logger.warn("grade_refresh_failed", {
          err: formatErrorForLog(err),
        });
      }
    },
  });

  // ── Initial hydrate (grade + comments + likedIds) ──
  useEffect(() => {
    if (cachedData) {
      dispatch({ type: "hydrate-route-data", data: cachedData, gradingScale });
      return;
    }
    // Without cache, fetchRouteData is the eager initial-paint call.
    // Set commentsLoaded immediately so a fast beta-expand doesn't
    // fire a second `fetchComments(1)` while this one is in flight.
    dispatch({ type: "set-loading-comments", loading: true });
    fetchRouteData(route.id)
      .then((data) => {
        dispatch({ type: "hydrate-route-data", data, gradingScale });
        onCacheRef.current?.(route.id, data);
      })
      .catch((err) =>
        logger.warn("fetchroutedata_failed", { err: formatErrorForLog(err) }),
      )
      .finally(() =>
        dispatch({ type: "set-loading-comments", loading: false }),
      );
  }, [route.id, cachedData, gradingScale]);

  // Cancel staggered badge toasts on unmount — they were dispatched
  // to celebrate a send INSIDE this open sheet. Once unmounted the
  // remaining toasts read as orphaned noise.
  useEffect(() => {
    return () => {
      for (const id of badgeToastTimersRef.current) clearTimeout(id);
      badgeToastTimersRef.current = [];
    };
  }, []);

  // ── Derived for orchestrator JSX ───────────────────
  const isCompleted = state.currentLog?.completed ?? false;
  const isCurrentFlash = state.currentLog ? isFlash(state.currentLog) : false;
  const zoneValue = state.currentLog?.zone ?? false;

  // ── Handlers ────────────────────────────────────────
  function changeAttempts(next: number) {
    if (isCompleted || !set.active) return;
    const clamped = Math.max(0, next);
    dispatch({ type: "set-attempts", attempts: clamped });

    const optimisticLog: RouteLog = state.currentLog
      ? { ...state.currentLog, attempts: clamped }
      : createOptimisticLog({
          id: "",
          user_id: userId ?? "",
          route_id: route.id,
          gym_id: set.gym_id,
          attempts: clamped,
          completed: false,
          zone: false,
        });
    dispatch({ type: "set-log", log: optimisticLog });
    onLogUpdate(route.id, optimisticLog);

    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(10);
    }
    attemptsFlush.schedule(clamped);
  }

  async function handleMarkComplete() {
    const { attempts, currentLog, gradeVote, completing } = stateRef.current;
    if (attempts < 1 || completing) return;

    // Cancel any pending attempts debounce — completeRoute carries
    // the latest attempts itself, and leaving the debounce running
    // would fire updateAttempts(completed=false) after this returns
    // and flash the panel back to non-completed.
    attemptsFlush.cancel();

    dispatch({ type: "begin-complete" });

    const snapshotLog = currentLog;
    const snapshotAttempts = attempts;

    const optimisticLog = createOptimisticLog({
      id: currentLog?.id ?? "",
      user_id: userId ?? "",
      route_id: route.id,
      gym_id: set.gym_id,
      attempts,
      completed: true,
      grade_vote: gradeVote ?? undefined,
      zone: currentLog?.zone ?? false,
    });

    dispatch({ type: "set-log", log: optimisticLog });
    onLogUpdate(route.id, optimisticLog);
    showToast(pickSendMessage(attempts === 1));

    const result = await completeRoute(
      route.id,
      attempts,
      gradeVote,
      currentLog?.zone ?? false,
      currentLog?.id,
    );
    if ("error" in result) {
      showToast(result.error, "error");
      dispatch({
        type: "revert-log",
        log: snapshotLog,
        attempts: snapshotAttempts,
        gradeVote: snapshotLog?.grade_vote ?? null,
      });
      if (snapshotLog) onLogUpdate(route.id, snapshotLog);
    } else if (result.log) {
      dispatch({ type: "set-log", log: result.log });
      onLogUpdate(route.id, result.log);
      if (result.earnedBadges) {
        result.earnedBadges.forEach((badge, i) => {
          const id = setTimeout(() => showAchievementToast(badge), i * 250);
          badgeToastTimersRef.current.push(id);
        });
      }
    }
    dispatch({ type: "end-complete" });
  }

  async function handleUncomplete() {
    const { currentLog, attempts, gradeVote } = stateRef.current;
    const previousLog = currentLog;
    const previousAttempts = attempts;
    const previousGradeVote = gradeVote;

    if (previousLog) {
      const optimisticLog: RouteLog = {
        ...previousLog,
        completed: false,
        grade_vote: null,
      };
      dispatch({ type: "set-log", log: optimisticLog });
      onLogUpdate(route.id, optimisticLog);
    }
    dispatch({ type: "set-grade-vote", vote: null });
    showToast("Completion removed");

    const result = await uncompleteRoute(route.id, previousLog?.id);
    if ("error" in result) {
      showToast(result.error, "error");
      dispatch({
        type: "revert-log",
        log: previousLog,
        attempts: previousAttempts,
        gradeVote: previousGradeVote,
      });
      if (previousLog) onLogUpdate(route.id, previousLog);
      return;
    }
    if (result.log) {
      dispatch({ type: "set-log", log: result.log });
      dispatch({ type: "set-attempts", attempts: result.log.attempts });
      onLogUpdate(route.id, result.log);
    }
  }

  async function handleZoneToggle(checked: boolean) {
    if (zoningRef.current) return;
    zoningRef.current = true;

    const base = stateRef.current.currentLog;
    if (base) {
      const next: RouteLog = { ...base, zone: checked };
      dispatch({ type: "set-log", log: next });
      onLogUpdate(route.id, next);
    }

    const result = await toggleZone(route.id, checked, logIdRef.current);
    if ("error" in result) {
      showToast(result.error, "error");
      // Revert via the LATEST committed log (after this handler ran
      // dispatch, stateRef has the optimistic value — patch back).
      const latest = stateRef.current.currentLog;
      if (latest) {
        dispatch({
          type: "set-log",
          log: { ...latest, zone: !checked },
        });
      }
    }
    zoningRef.current = false;
  }

  function handleGradeVote(vote: number | null) {
    dispatch({ type: "set-grade-vote", vote });
    gradeFlush.schedule(vote);
  }

  function handleExpandBeta() {
    dispatch({ type: "toggle-beta" });
    if (!state.commentsLoaded && !state.loadingComments) {
      dispatch({ type: "set-loading-comments", loading: true });
      fetchComments(route.id, 1)
        .then((result) => {
          dispatch({ type: "seed-comments", result });
        })
        .finally(() =>
          dispatch({ type: "set-loading-comments", loading: false }),
        );
    }
  }

  async function loadMore() {
    dispatch({ type: "set-loading-more", loading: true });
    try {
      const result = await fetchComments(route.id, state.nextPage);
      dispatch({ type: "append-comments", result });
    } finally {
      dispatch({ type: "set-loading-more", loading: false });
    }
  }

  async function onPostComment(body: string): Promise<boolean> {
    try {
      const result = await postComment(route.id, body);
      if ("error" in result) {
        showToast(result.error, "error");
        return false;
      }
      dispatch({ type: "prepend-comment", comment: result.comment });
      return true;
    } catch {
      showToast("Something went wrong", "error");
      return false;
    }
  }

  async function onEditComment(
    commentId: string,
    body: string,
  ): Promise<boolean> {
    const result = await editComment(commentId, body);
    if ("error" in result) {
      showToast(result.error, "error");
      return false;
    }
    dispatch({ type: "replace-comment", comment: result.comment });
    return true;
  }

  async function onLikeComment(commentId: string) {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      showToast(
        "You're offline — likes available when you reconnect",
        "info",
      );
      return;
    }
    if (likingRef.current.has(commentId)) return;
    likingRef.current.add(commentId);

    const wasLiked = stateRef.current.likedIds.has(commentId);
    // Optimistic flip — atomically updates the heart AND the count.
    dispatch({ type: "toggle-like", commentId, liked: !wasLiked });

    const result = await likeComment(commentId);
    if ("error" in result) {
      // Revert by applying the same toggle in reverse.
      dispatch({ type: "toggle-like", commentId, liked: wasLiked });
      showToast(result.error, "error");
    }
    likingRef.current.delete(commentId);
  }

  return {
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
  };
}
