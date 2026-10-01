"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { showToast } from "@/components/ui";
import { useDebouncedFlush } from "@/hooks/use-debounced-flush";
import { useMatchRealtime, type MatchEvent } from "@/hooks/use-match-realtime";
import type { ActionResult } from "@/lib/action-result";
import type { Discipline } from "@/lib/data/grade-label";
import type { MatchRoute, MatchState } from "@/lib/data/match-types";
import type { SeatViewer } from "@/lib/data/seat";
import {
  addMatchRouteAction,
  updateMatchRouteAction,
  endMatchAction,
  leaveMatchAction,
  deleteMatchAction,
  fetchChorkStandings,
  fetchMatchBoard,
  fetchChorkAllowance,
  concedeChorkRound,
  withdrawChorkRoute,
  addMatchGuestAction,
  setMatchCeilingAction,
  removeMatchGuestAction,
  setMatchSetupAction,
  setMatchGameMode,
  type MatchSetupPayload,
} from "@/app/match/actions";
import { upsertMatchLogOffline } from "@/app/match/offline-actions";
import { initMatchState, logKey, matchReducer, type MatchPanel } from "./matchScreenReducer";
import { planEvent, scoringEffects, type MatchEffect } from "./matchScreenPlan";
import { isChorkMatch, selectBoard, viewerLogs } from "./matchScreenSelectors";

/**
 * The live match screen's wiring — the `useXState` half of the reducer
 * + hook pattern (CLAUDE.md "Complex client state").
 *
 * It decides nothing. The model is `matchScreenReducer`; what a
 * realtime event means is `planEvent`; what the screen derives is
 * `matchScreenSelectors`. Each of those is pure and tested. What is
 * left here is the part that has to touch the world: the realtime
 * channel, the router, the server actions and their debounces.
 *
 * `bundle` is the server's payload for this render. It is the first
 * state, and every refresh hands down a new one, which `sync` merges.
 */
export function useMatchScreenState({ bundle, userId }: { bundle: MatchState; userId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [state, dispatch] = useReducer(matchReducer, bundle, initMatchState);
  const matchId = state.match.id;
  const isChork = isChorkMatch(state);

  // Who is looking, for every seat rule (`entersLogsFor` in seat.ts).
  const hostId = state.match.host_id;
  const viewer = useMemo<SeatViewer>(
    () => ({ userId, isHost: hostId === userId }),
    [userId, hostId],
  );

  // A refresh re-runs the page and hands down a new bundle. The reducer
  // initialises once, so without this every refreshed bundle was thrown
  // away — the repair for a missed realtime event repaired nothing.
  // Adjusting state during render is the documented React pattern for
  // "prop changed, derive state again", and the only one
  // `react-hooks/set-state-in-effect` allows.
  const [synced, setSynced] = useState(bundle);
  if (synced !== bundle) {
    setSynced(bundle);
    dispatch({ type: "sync", bundle });
  }

  // ── Leaving a deleted game ─────────────────────────────────────
  //
  // Set once the game is deleted under this screen ("deleted": the
  // viewer's own seat's DELETE arrived) or this device is deleting it
  // ("deleting"). From then on nothing here may add to Next's router
  // queue while the navigation to Games is in flight. In Next 16.2 a
  // navigation discards the pending action without moving the queue's
  // tail (`dispatchAction` in app-router-instance.js), so what's
  // dispatched next can hang off the discarded action and never run, or
  // start from the old page's state, and React renders that instead of
  // Games: the player stays here under the toast. So realtime
  // events are ignored, both debounced refetches are cancelled, and a
  // refetch already on the wire keeps its answer to itself.
  const leavingRef = useRef<"deleting" | "deleted" | null>(null);

  // ── What only the server can score ─────────────────────────────
  //
  // Chork's letters and pen need every player's raw attempt count, and
  // other players' points need theirs; both are private to their owner
  // (CONTEXT.md "Attempt privacy"). So the server derives them and this
  // screen asks again shortly after anything that could move them.
  // Debounced, because working a route is a burst of events.
  const { schedule: scheduleChork, cancel: cancelChork } = useDebouncedFlush<void>({
    delayMs: 1000,
    flush: async () => {
      const result = await fetchChorkStandings(matchId);
      if ("error" in result || leavingRef.current) return;
      dispatch({ type: "set-chork", standings: result.standings });
    },
  });
  const { schedule: scheduleBoard, cancel: cancelBoard } = useDebouncedFlush<void>({
    delayMs: 800,
    flush: async () => {
      const result = await fetchMatchBoard(matchId);
      if ("error" in result || leavingRef.current) return;
      dispatch({ type: "set-board", rows: result.rows });
    },
  });

  // Chork's standings aren't in the bundle and a log event is not
  // guaranteed to arrive, so without this someone opening a game in
  // progress reads every seat as nought letters and nobody setting.
  // `live` is per effect run, not a mounted ref — StrictMode's second
  // run gets its own.
  useEffect(() => {
    if (!isChork) return;
    let live = true;
    void fetchChorkStandings(matchId).then((result) => {
      if (live && !("error" in result)) dispatch({ type: "set-chork", standings: result.standings });
    });
    return () => {
      live = false;
    };
  }, [isChork, matchId]);

  // Games opens from the nav's full prefetch, which can predate the
  // deletion: the host's action revalidated the server and the host's
  // own router cache, not this device's. So a screen whose game was
  // deleted under it refreshes Games once the navigation there has
  // landed, which is when this screen unmounts. Next applies a
  // navigation to its queue before React commits it, so this refresh
  // can't hang off an action the navigation discarded. Dispatched
  // straight after the replace it could, if an action was in flight as
  // the seat's DELETE arrived with nothing queued behind it. The device
  // that pressed Delete needs none: its own action revalidated its cache.
  useEffect(
    () => () => {
      if (leavingRef.current === "deleted") router.refresh();
    },
    [router],
  );

  const run = useCallback(
    (effects: MatchEffect[]) => {
      for (const effect of effects) {
        switch (effect.kind) {
          case "refetch-board":
            scheduleBoard(undefined);
            break;
          case "refetch-chork":
            scheduleChork(undefined);
            break;
          case "refresh":
            router.refresh();
            break;
          case "ended":
            // `replace`, not `push`: back from the summary should reach
            // wherever they came from, not a live screen that no longer is.
            router.replace(`/match/summary/${matchId}`);
            break;
          case "deleted":
            leavingRef.current = "deleted";
            cancelBoard();
            cancelChork();
            showToast("This game was deleted", "warning");
            router.replace("/match");
            break;
        }
      }
    },
    [router, matchId, scheduleBoard, scheduleChork, cancelBoard, cancelChork],
  );

  useMatchRealtime(matchId, (event: MatchEvent) => {
    if (leavingRef.current) return;
    const plan = planEvent(state, viewer, event);
    plan.actions.forEach(dispatch);
    run(plan.effects);
  });

  const board = useMemo(() => selectBoard(state, viewer), [state, viewer]);
  const myLogs = useMemo(() => viewerLogs(state, viewer), [state, viewer]);

  // ── Writes ─────────────────────────────────────────────────────

  /**
   * The shape every write here has: run the server action in a
   * transition (so `isPending` covers it), toast a refusal in the
   * server's own words, otherwise apply the result. Local to this hook
   * on purpose (ADR-0001).
   */
  const act = useCallback(
    <T,>(
      action: () => Promise<ActionResult<T>>,
      onSuccess: (result: { success: true } & T) => void,
      onRefused?: () => void,
    ) => {
      startTransition(async () => {
        const result = await action();
        if ("error" in result) {
          showToast(result.error, "error");
          onRefused?.();
          return;
        }
        onSuccess(result);
      });
    },
    [],
  );

  const closePanel = useCallback(() => dispatch({ type: "close-panel" }), []);

  const openPanel = useCallback(
    (panel: MatchPanel) => {
      dispatch({ type: "open-panel", panel });
      // Opening a round is the moment to find out how many goes it
      // carries. Fetched rather than derived because the allowance
      // depends on the setter's attempt count, which is theirs alone.
      if (isChork && panel.kind === "log") {
        const { routeId, playerId } = panel;
        startTransition(async () => {
          const result = await fetchChorkAllowance(matchId, routeId, playerId);
          if ("error" in result) return;
          dispatch({ type: "set-allowance", routeId, seatId: playerId, value: result.allowance });
        });
      }
    },
    [isChork, matchId],
  );

  const gameMode = state.match.game_mode;

  const handleAddRoute = useCallback(
    (payload: {
      description: string | null;
      grade: number | null;
      hasZone: boolean;
      discipline: Discipline;
      /**
       * Whose turn it is, when that's a guest and the host is tapping
       * for them. The route is recorded against the SEAT, so the pen
       * stays where it belongs instead of bouncing back to the host.
       */
      playerId?: string | null;
    }) =>
      act(
        () => addMatchRouteAction({ matchId, ...payload, playerId: payload.playerId ?? null }),
        ({ route }) => {
          // Painted on server success, not on the realtime echo, which
          // drops often enough for the creator to see a stale grid.
          // `upsert-route` is idempotent on id, so the echo is a no-op.
          dispatch({ type: "upsert-route", route });
          closePanel();
          // And asks what the echo would: in Chork a new route moves
          // the pen, which used to wait for somebody to log something.
          run(scoringEffects({ game_mode: gameMode }));
        },
      ),
    [act, matchId, closePanel, run, gameMode],
  );

  const handleUpdateRoute = useCallback(
    (
      routeId: string,
      payload: {
        description: string | null;
        grade: number | null;
        hasZone: boolean;
        discipline: Discipline;
      },
    ) =>
      act(
        () => updateMatchRouteAction({ routeId, ...payload }),
        ({ route }) => {
          dispatch({ type: "upsert-route", route });
          closePanel();
          // A regrade can move anyone's handicapped points.
          run(scoringEffects({ game_mode: gameMode }));
        },
      ),
    [act, closePanel, run, gameMode],
  );

  const handleAddGuest = useCallback(
    (name: string) =>
      act(
        () => addMatchGuestAction(matchId, name),
        ({ player }) => {
          // Same reasoning as routes: paint on server success.
          dispatch({
            type: "upsert-player",
            player: {
              player_id: player.id,
              user_id: null,
              is_guest: true,
              username: null,
              display_name: player.display_name,
              avatar_url: null,
              joined_at: player.joined_at,
              is_host: false,
              has_left: false,
              // The host declares these separately, after seating them.
              ceiling: null,
              alt_ceiling: null,
            },
          });
          closePanel();
        },
      ),
    [act, matchId, closePanel],
  );

  const handleRemoveGuest = useCallback(
    (playerId: string) =>
      act(
        () => removeMatchGuestAction(playerId),
        () => {
          dispatch({ type: "remove-player", playerId });
          closePanel();
        },
      ),
    [act, closePanel],
  );

  const handleSetCeiling = useCallback(
    (playerId: string, ceiling: number | null, altCeiling: number | null) =>
      act(
        () => setMatchCeilingAction(matchId, playerId, ceiling, altCeiling),
        () => {
          // Patched here so the board re-scores at once: the handicap is
          // computed from `players`.
          dispatch({ type: "set-ceiling", playerId, ceiling, altCeiling });
          closePanel();
        },
      ),
    [act, matchId, closePanel],
  );

  /** Optimistic log write for the given route + rollback on rejection. */
  const handleLog = useCallback(
    (
      route: MatchRoute,
      payload: { attempts: number; completed: boolean; zone: boolean },
      // A GUEST seat the host is entering for. Absent = own card.
      playerId?: string,
    ) => {
      const ownerId = playerId ?? userId;
      const previous = state.logs.get(logKey(ownerId, route.id));
      // Captured once here rather than inline in the dispatched object:
      // `react-hooks/purity` flags `new Date()` in a render-adjacent path.
      const now = new Date().toISOString();
      // The tile and the board react at once; the server's row replaces
      // this one when its echo arrives. Pending until the server has it,
      // so a resync in between keeps the tap (see `syncFromServer`).
      dispatch({
        type: "upsert-log",
        viewer,
        pending: true,
        log: {
          id: previous?.id ?? `optimistic-${route.id}`,
          set_id: matchId,
          route_id: route.id,
          // Exactly one of these, matching `route_logs_owner_ck`.
          user_id: playerId ? null : userId,
          player_id: playerId ?? null,
          attempts: payload.attempts,
          completed: payload.completed,
          completed_at: payload.completed ? previous?.completed_at ?? now : null,
          zone: payload.zone,
          created_at: previous?.created_at ?? now,
          updated_at: now,
        },
      });

      act(
        // Offline-aware: queued in IndexedDB if the network is down or
        // dies mid-request, and replayed on reconnect. The RPC is
        // idempotent on (owner, route), so a replay never duplicates.
        // (`await`ed here: the wrapper is typed as a promise of the
        // action's own promise.)
        async () =>
          await upsertMatchLogOffline({
            matchRouteId: route.id,
            attempts: payload.attempts,
            completed: payload.completed,
            zone: payload.zone,
            playerId: playerId ?? null,
          }),
        (result) => {
          // Written, unless it only reached the offline queue: then it
          // stays pending until the replay's realtime echo lands.
          if (!("queued" in result && result.queued)) {
            dispatch({ type: "settle-log", ownerId, routeId: route.id });
          }
          // Letters and the pen move on a log, and only the server can
          // say how. This waited for the log's own realtime echo.
          if (gameMode === "chork") run([{ kind: "refetch-chork" }]);
        },
        () => {
          if (previous) dispatch({ type: "upsert-log", log: previous, viewer });
          else dispatch({ type: "remove-log", userId: ownerId, routeId: route.id });
        },
      );
    },
    [act, matchId, state.logs, userId, viewer, run, gameMode],
  );

  const handleConcede = useCallback(
    (routeId: string, playerId?: string) =>
      act(
        () => concedeChorkRound(matchId, routeId, playerId),
        () => {
          closePanel();
          run([{ kind: "refetch-chork" }, { kind: "refresh" }]);
        },
      ),
    [act, matchId, closePanel, run],
  );

  /**
   * The setter's way out, and the only thing that moves the pen. The
   * route leaves the room at once — the realtime UPDATE that follows
   * carries `withdrawn_at`, which the reducer treats as a removal, so
   * the echo is a no-op rather than a resurrection.
   */
  const handleWithdraw = useCallback(
    (routeId: string, playerId?: string | null) =>
      act(
        () => withdrawChorkRoute(matchId, routeId, playerId),
        () => {
          dispatch({ type: "remove-route", id: routeId });
          closePanel();
          run([{ kind: "refetch-chork" }, { kind: "refresh" }]);
        },
      ),
    [act, matchId, closePanel, run],
  );

  /**
   * Park your seat and go.
   *
   * Straight to the Match list rather than the summary: the Match is
   * still running for everyone else, and dropping the leaver on a
   * result page for a live contest reads as though it ended.
   */
  const handleLeave = useCallback(
    () => act(() => leaveMatchAction(matchId), () => router.push("/match")),
    [act, matchId, router],
  );

  const handleEnd = useCallback(
    () =>
      act(
        () => endMatchAction(matchId),
        ({ summaryId }) => router.push(`/match/summary/${summaryId}?fresh=1`),
      ),
    [act, matchId, router],
  );

  const handleDelete = useCallback(() => {
    // Leaving from the press, not the answer: the deletion's own events
    // reach this device before the action returns, and none of them may
    // toast a second time or leave work in the router queue for the
    // navigation below to lose (see leavingRef).
    leavingRef.current = "deleting";
    cancelBoard();
    cancelChork();
    act(
      () => deleteMatchAction(matchId),
      () => {
        showToast("Game deleted");
        router.replace("/match");
      },
      () => {
        leavingRef.current = null;
      },
    );
  }, [act, matchId, router, cancelBoard, cancelChork]);

  // The setup is the Match row and its grades. The row's own realtime
  // UPDATE patches the model on every device, this one included; the
  // refresh brings a custom ladder, which lives in another table. The
  // sheet closes with the refresh, on the fresh model rather than a
  // guess, and stays open on a refusal.
  const handleSetup = useCallback(
    (payload: MatchSetupPayload) =>
      act(
        () => setMatchSetupAction(matchId, payload),
        () =>
          startTransition(() => {
            router.refresh();
            closePanel();
          }),
      ),
    [act, matchId, router, closePanel],
  );

  const handleGameMode = useCallback(
    (mode: "points" | "chork") =>
      act(
        () => setMatchGameMode(matchId, mode),
        () => {
          router.refresh();
          closePanel();
        },
      ),
    [act, matchId, router, closePanel],
  );

  return {
    state,
    viewer,
    board,
    myLogs,
    isPending,
    openPanel,
    closePanel,
    handleSetup,
    handleGameMode,
    handleAddRoute,
    handleAddGuest,
    handleRemoveGuest,
    handleSetCeiling,
    handleUpdateRoute,
    handleLog,
    handleEnd,
    handleLeave,
    handleDelete,
    handleConcede,
    handleWithdraw,
  };
}
