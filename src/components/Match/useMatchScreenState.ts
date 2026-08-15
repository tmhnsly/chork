"use client";

import { useCallback, useMemo, useReducer, useTransition } from "react";
import { useRouter } from "next/navigation";
import { showToast } from "@/components/ui";
import { useMatchRealtime } from "@/hooks/use-match-realtime";
import { computeMatchLeaderboard } from "@/lib/data/match-leaderboard";
import type { MatchState, MatchRoute, MatchLog } from "@/lib/data/match-types";
import type { Discipline } from "@/lib/data/grade-label";
import { ownerIdOf } from "@/lib/data/match-types";
import {
  addMatchRouteAction,
  updateMatchRouteAction,
  endMatchAction,
  addMatchGuestAction,
  removeMatchGuestAction,
} from "@/app/match/actions";
import { upsertMatchLogOffline } from "@/app/match/offline-actions";
import {
  initMatchState,
  matchReducer,
  type MatchPanel,
  logKey,
} from "./matchScreenReducer";

/**
 * State + handlers for the live match screen — the `useXState` half of
 * the reducer + hook pattern (CLAUDE.md "Complex client state";
 * reference shape: `useRouteLogState`). `MatchScreen` stays JSX + prop
 * bridging; everything that can go wrong (realtime merge, optimistic
 * log + rollback, offline queue, panel exclusivity) lives here or in
 * the reducer.
 *
 * The realtime → reducer wiring passes `viewerId` with every log
 * upsert so the reducer's privacy gate (raw attempts are owner-only)
 * applies — see matchScreenReducer.ts for the invariant.
 */
export function useMatchScreenState({
  initialState,
  userId,
}: {
  initialState: MatchState;
  userId: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [state, dispatch] = useReducer(matchReducer, initialState, initMatchState);

  useMatchRealtime(initialState.match.id, {
    onRouteChange: (evt) => {
      if (evt.eventType === "DELETE") {
        dispatch({ type: "remove-route", id: evt.old.id });
      } else {
        dispatch({ type: "upsert-route", route: evt.new });
      }
    },
    onLogChange: (evt) => {
      if (evt.eventType === "DELETE") {
        dispatch({
          type: "remove-log",
          userId: ownerIdOf(evt.old),
          routeId: evt.old.route_id,
        });
      } else {
        // The reducer sanitises other players' raw attempt counts —
        // this call site just declares who is looking.
        dispatch({ type: "upsert-log", log: evt.new, viewerId: userId });
      }
    },
    onPlayerChange: () => {
      // Player changes come as scattered events — a full state
      // refresh is cheaper to reason about than hand-patched set
      // maths when someone joins or leaves.
      router.refresh();
    },
  });

  // Derive the live leaderboard from current logs. Matches the
  // server-side formula in get_match_leaderboard exactly (pinned by
  // scoring-parity.test.ts) so the display doesn't desync with the
  // summary calculation on end.
  const leaderboard = useMemo(
    () => computeMatchLeaderboard(state.players, state.logs),
    [state.players, state.logs],
  );

  // Logs keyed by route id, just the current user. Drives tile
  // state derivation + log-sheet pre-fill.
  const myLogByRouteId = useMemo(() => {
    const map = new Map<string, MatchLog>();
    for (const log of state.logs.values()) {
      if (log.user_id === userId) map.set(log.route_id, log);
    }
    return map;
  }, [state.logs, userId]);

  const openPanel = useCallback(
    (panel: MatchPanel) => dispatch({ type: "open-panel", panel }),
    [],
  );
  const closePanel = useCallback(() => dispatch({ type: "close-panel" }), []);

  const handleAddRoute = useCallback(
    async (payload: {
      description: string | null;
      grade: number | null;
      hasZone: boolean;
      discipline: Discipline;
    }) => {
      startTransition(async () => {
        const result = await addMatchRouteAction({
          matchId: initialState.match.id,
          description: payload.description,
          grade: payload.grade,
          hasZone: payload.hasZone,
          discipline: payload.discipline,
        });
        if ("error" in result) {
          showToast(result.error, "error");
          return;
        }
        // Paint the new row locally on server success — the realtime
        // self-echo is unreliable for the creator right after an HTTP
        // round-trip, so the grid would otherwise stay stale until a
        // refresh. The reducer's upsert-route is idempotent on id, so
        // the echo (when it arrives) is a harmless no-op.
        dispatch({ type: "upsert-route", route: result.route });
        dispatch({ type: "close-panel" });
      });
    },
    [initialState.match.id],
  );

  const handleAddGuest = useCallback(
    async (name: string) => {
      startTransition(async () => {
        const result = await addMatchGuestAction(initialState.match.id, name);
        if ("error" in result) {
          showToast(result.error, "error");
          return;
        }
        // Same reasoning as routes: paint locally on server success
        // rather than wait on a realtime self-echo that drops often
        // enough for the host to think nothing happened.
        dispatch({
          type: "upsert-player",
          player: {
            player_id: result.player.id,
            user_id: null,
            is_guest: true,
            username: null,
            display_name: result.player.display_name,
            avatar_url: null,
            joined_at: result.player.joined_at,
            is_host: false,
          },
        });
        dispatch({ type: "close-panel" });
      });
    },
    [initialState.match.id],
  );

  const handleRemoveGuest = useCallback(
    async (playerId: string) => {
      startTransition(async () => {
        const result = await removeMatchGuestAction(playerId);
        if ("error" in result) {
          showToast(result.error, "error");
          return;
        }
        dispatch({ type: "remove-player", playerId });
        dispatch({ type: "close-panel" });
      });
    },
    [],
  );

  const handleUpdateRoute = useCallback(
    async (
      routeId: string,
      payload: {
        description: string | null;
        grade: number | null;
        hasZone: boolean;
        discipline: Discipline;
      },
    ) => {
      startTransition(async () => {
        const result = await updateMatchRouteAction({
          routeId,
          description: payload.description,
          grade: payload.grade,
          hasZone: payload.hasZone,
          discipline: payload.discipline,
        });
        if ("error" in result) {
          showToast(result.error, "error");
          return;
        }
        dispatch({ type: "upsert-route", route: result.route });
        dispatch({ type: "close-panel" });
      });
    },
    [],
  );

  /** Optimistic log write for the given route + rollback on rejection. */
  const handleLog = useCallback(
    async (
      route: MatchRoute,
      payload: { attempts: number; completed: boolean; zone: boolean },
      // A GUEST seat the host is entering for. Absent = own card.
      playerId?: string,
    ) => {
      const ownerId = playerId ?? userId;
      const previous = state.logs.get(logKey(ownerId, route.id));
      // Capture `now` once at callback entry rather than inline in
      // the dispatched object. The `react-hooks/purity` lint rule
      // flags `new Date()` anywhere in a render-adjacent path; doing
      // it here keeps the pattern out of the reducer payload.
      const now = new Date().toISOString();
      // Optimistic write — dispatch a local patch so the tile +
      // leaderboard react instantly, then fire the action. Realtime
      // echo overwrites with the server's row on success.
      dispatch({
        type: "upsert-log",
        viewerId: userId,
        log: {
          id: previous?.id ?? `optimistic-${route.id}`,
          set_id: initialState.match.id,
          route_id: route.id,
          // Exactly one of these, matching `route_logs_owner_ck`.
          user_id: playerId ? null : userId,
          player_id: playerId ?? null,
          attempts: payload.attempts,
          completed: payload.completed,
          completed_at: payload.completed
            ? previous?.completed_at ?? now
            : null,
          zone: payload.zone,
          created_at: previous?.created_at ?? now,
          updated_at: now,
        },
      });

      startTransition(async () => {
        // Offline-aware wrapper — queues the upsert in IndexedDB if
        // we're offline (or the network dies mid-request) so the
        // climber's local tile flip sticks and the server write
        // replays on reconnect. The server-side RPC is idempotent
        // on (user_id, route_id) so replays never duplicate.
        const result = await upsertMatchLogOffline({
          matchRouteId: route.id,
          attempts: payload.attempts,
          completed: payload.completed,
          zone: payload.zone,
          playerId: playerId ?? null,
        });
        if (result && typeof result === "object" && "error" in result) {
          showToast((result as { error: string }).error, "error");
          // Roll back to the previous log if the action rejected.
          if (previous) {
            dispatch({ type: "upsert-log", log: previous, viewerId: userId });
          } else {
            dispatch({ type: "remove-log", userId: ownerId, routeId: route.id });
          }
        }
      });
    },
    [initialState.match.id, state.logs, userId],
  );

  const handleEnd = useCallback(() => {
    startTransition(async () => {
      const result = await endMatchAction(initialState.match.id);
      if ("error" in result) {
        showToast(result.error, "error");
        return;
      }
      router.push(`/match/summary/${result.summaryId}?fresh=1`);
    });
  }, [initialState.match.id, router]);

  return {
    state,
    leaderboard,
    myLogByRouteId,
    isPending,
    openPanel,
    closePanel,
    handleAddRoute,
    handleAddGuest,
    handleRemoveGuest,
    handleUpdateRoute,
    handleLog,
    handleEnd,
  };
}
