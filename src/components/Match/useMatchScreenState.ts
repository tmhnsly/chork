"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useTransition,
} from "react";
import { useDebouncedFlush } from "@/hooks/use-debounced-flush";
import { useRouter } from "next/navigation";
import { showToast } from "@/components/ui";
import { useMatchRealtime } from "@/hooks/use-match-realtime";
import { computeMatchLeaderboard } from "@/lib/data/match-leaderboard";
import type { MatchLog, MatchPlayerView, MatchRoute, MatchState } from "@/lib/data/match-types";
import { ceilingForDiscipline, type Discipline } from "@/lib/data/grade-label";
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
import {
  initMatchState,
  matchReducer,
  seatEventOutcome,
  logEntryById,
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

  /**
   * Take the roster back off the server after a refresh.
   *
   * `useReducer`'s third argument runs ONCE. Join and leave events
   * called `router.refresh()`, which re-ran the server component and
   * handed down a fresh `initialState` — that the reducer then threw
   * away, because it had already initialised. Net effect: a mate who
   * joined mid-Match stayed invisible until someone reloaded the
   * page, on the one screen where "who else is here" is the point.
   *
   * Routes and logs never had this problem: their realtime payloads
   * carry the whole row, so they dispatch straight from the event. A
   * `set_players` row can't — it holds a `user_id`, not a username or
   * an avatar — which is why joins take the server round-trip at all.
   *
   * Adjusting state during render rather than in an effect is the
   * documented React pattern for "prop changed, derive state again",
   * and the only one `react-hooks/set-state-in-effect` allows.
   * Keyed on a roster signature, not object identity, so an unrelated
   * refresh doesn't churn the board.
   */
  const rosterKey = initialState.players
    .map((p) => `${p.player_id}:${p.has_left ? 1 : 0}`)
    .join(",");
  const [syncedRoster, setSyncedRoster] = useState(rosterKey);
  if (rosterKey !== syncedRoster) {
    setSyncedRoster(rosterKey);
    dispatch({ type: "set-players", players: initialState.players });
  }

  // ── Chork ──────────────────────────────────────────────────────
  //
  // Nothing about Chork can be worked out here: letters AND whose turn
  // it is to set both need every player's raw attempt count, and those
  // are private to their owner (CONTEXT.md "Attempt privacy"). A
  // viewer who isn't the setter can't see whether the setter sent
  // their own challenge, which is the whole pen rule. The server
  // derives both and sends back only the public result. Same shape as
  // the rank strip — debounced, because working a route is a burst.
  const isChork = initialState.match.game_mode === "chork";
  const [chork, setChork] = useState<{
    letters: Map<string, number>;
    penSeatId: string | null;
  }>(() => ({ letters: new Map(), penSeatId: null }));

  // Fetch only — the caller decides whether to keep the answer, which
  // is what lets the mount-time load below drop a result that landed
  // after a fresher one.
  const loadChork = useCallback(async () => {
    if (!isChork) return null;
    const result = await fetchChorkStandings(initialState.match.id);
    if ("error" in result) return null;
    return {
      letters: new Map(result.standings.map((s) => [s.player_id, s.letters])),
      penSeatId: result.standings.find((s) => s.has_pen)?.player_id ?? null,
    };
  }, [isChork, initialState.match.id]);

  // The board starts empty and a log event is not guaranteed to
  // arrive, so without this someone opening a match already in
  // progress reads every seat as nought letters and nobody setting.
  // `live` is per effect run, not a mounted ref — StrictMode's second
  // run gets its own, which is exactly the trap that left the browse
  // buttons dead after one press.
  useEffect(() => {
    let live = true;
    void loadChork().then((next) => {
      if (live && next) setChork(next);
    });
    return () => {
      live = false;
    };
  }, [loadChork]);

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

  const { schedule: scheduleChork, cancel: cancelChork } = useDebouncedFlush<void>({
    delayMs: 1000,
    flush: async () => {
      const next = await loadChork();
      if (next && !leavingRef.current) setChork(next);
    },
  });

  // ── The points board ───────────────────────────────────────────
  //
  // Found at Yonder: other players' scores read 0 after a reload and
  // were wrong live for every send that wasn't a flash. Their logs reach
  // this browser collapsed to the public buckets, so the phone cannot
  // score them. The server can, so their rows come from
  // `get_match_leaderboard`: the bundle's board on load, refetched
  // shortly after one of their logs or a route changes. The viewer's
  // own seat, and a host's guests, stay scored here from raw logs so a
  // tap shows at once. Chork has no points board to keep.
  const isHost = initialState.match.host_id === userId;
  const [serverBoard, setServerBoard] = useState(() => ({
    source: initialState.leaderboard,
    rows: initialState.leaderboard,
  }));
  // A refresh hands down a fresh bundle; take its board, the same
  // render-time sync the roster uses above.
  if (serverBoard.source !== initialState.leaderboard) {
    setServerBoard({ source: initialState.leaderboard, rows: initialState.leaderboard });
  }
  const scoredHere = useCallback(
    (p: MatchPlayerView) => p.user_id === userId || (isHost && p.is_guest),
    [userId, isHost],
  );
  const { schedule: scheduleBoard, cancel: cancelBoard } = useDebouncedFlush<void>({
    delayMs: 800,
    flush: async () => {
      if (isChork) return;
      const result = await fetchMatchBoard(initialState.match.id);
      if ("error" in result || leavingRef.current) return;
      setServerBoard((prev) => ({ source: prev.source, rows: result.rows }));
    },
  });

  const viewerSeatId = state.players.find((p) => p.user_id === userId)?.player_id ?? null;

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

  useMatchRealtime(initialState.match.id, {
    onRouteChange: (evt) => {
      if (leavingRef.current) return;
      if (evt.eventType === "DELETE") {
        dispatch({ type: "remove-route", id: evt.old.id });
      } else {
        dispatch({ type: "upsert-route", route: evt.new });
      }
      // A route IS a round, so putting one up moves the pen and can
      // change who owes a letter. This listened only to log events, so
      // the board sat on the previous setter until somebody happened
      // to log something.
      if (isChork) scheduleChork(undefined);
      // A route withdrawn or regraded can move anyone's points.
      else scheduleBoard(undefined);
    },
    onLogChange: (evt) => {
      if (leavingRef.current) return;
      // The scoring check below needs the log's owner even on a
      // DELETE, whose payload carries only the id — so on a DELETE
      // it's read from state, before the dispatch removes it there.
      const row =
        evt.eventType === "DELETE"
          ? logEntryById(state.logs, evt.old.id)?.[1]
          : evt.new;
      if (evt.eventType === "DELETE") {
        // A DELETE event carries only the log's id (checked 2026-09-15).
        dispatch({ type: "remove-log-by-id", id: evt.old.id });
      } else {
        // The reducer sanitises other players' raw attempt counts —
        // this call site just declares who is looking.
        dispatch({ type: "upsert-log", log: evt.new, viewerId: userId });
      }
      // Anyone's log can change who owes a letter, so this listens to
      // every log event rather than only the viewer's own.
      if (isChork) scheduleChork(undefined);
      else {
        // Seats scored here already moved with the dispatch above; only
        // someone else's log needs the server's scoring. A log this
        // screen never held (row undefined) still triggers the
        // refetch — the safe default.
        const scoredLocally =
          row !== undefined &&
          (row.user_id === userId || (row.user_id === null && isHost));
        if (!scoredLocally) scheduleBoard(undefined);
      }
    },
    onPlayerChange: (evt) => {
      if (leavingRef.current) return;
      const outcome = seatEventOutcome(evt, viewerSeatId);
      if (outcome.kind === "deleted") {
        leavingRef.current = "deleted";
        cancelBoard();
        cancelChork();
        showToast("This game was deleted", "warning");
        router.replace("/match");
      } else if (outcome.kind === "gone") {
        // Never a refresh on a DELETE: see seatEventOutcome.
        dispatch({ type: "remove-player", playerId: outcome.seatId });
      } else {
        // A join or a leave. Player changes come as scattered events —
        // a full state refresh is cheaper to reason about than
        // hand-patched set maths. The refreshed roster reaches the
        // reducer via the render-time sync above.
        router.refresh();
      }
    },
    onMatchChange: (evt) => {
      if (leavingRef.current) return;
      // The host ended it. Everyone else is looking at a board that
      // has silently stopped accepting writes, so move them to the
      // result rather than let them tap into a dead screen.
      //
      // `replace`, not `push`: back from the summary should reach
      // wherever they came from, not a live screen that no longer is.
      if (evt.eventType === "UPDATE" && evt.new.status === "archived") {
        router.replace(`/match/summary/${initialState.match.id}`);
      }
    },
  });

  // Derive the live leaderboard from current logs. Matches the
  // server-side formula in get_match_leaderboard exactly (pinned by
  // scoring-parity.test.ts) so the display doesn't desync with the
  // summary calculation on end.
  // A log knows its route id but not its grade, and the handicap
  // needs the grade. Same resolution the server uses: what the adder
  // declared, else what climbers voted.
  const gradeByRouteId = useMemo(
    () =>
      new Map(
        state.routes.map((r) => [
          r.id,
          r.declared_grade ?? r.community_grade ?? null,
        ]),
      ),
    [state.routes],
  );

  // A ceiling is a number on a ladder, so it only means anything
  // against the ladder it was given on — a 6b rope and a V6 boulder
  // are both ordinal 6 and share no arithmetic. Every route resolves
  // to the limit for ITS family (migration 121); on a
  // single-discipline Match that is always the same one.
  //
  // This briefly nulled the off-family GRADE instead, which scored
  // those routes flat. That was the honest answer while a climber had
  // only one ceiling; they have two now, and the rope half of a mixed
  // session was going unhandicapped.
  const disciplineByRouteId = useMemo(
    () => new Map(state.routes.map((r) => [r.id, r.discipline])),
    [state.routes],
  );
  const ceilingForRoute = useCallback(
    (player: MatchPlayerView, routeId: string) =>
      ceilingForDiscipline(
        initialState.match,
        player,
        disciplineByRouteId.get(routeId) ?? null,
      ),
    [initialState.match, disciplineByRouteId],
  );

  const leaderboard = useMemo(
    () =>
      computeMatchLeaderboard(state.players, state.logs, {
        handicap: initialState.match.handicap,
        gradeByRouteId,
        ceilingForRoute,
        serverRows: isChork ? undefined : serverBoard.rows,
        scoredHere,
      }),
    [
      state.players,
      state.logs,
      initialState.match.handicap,
      gradeByRouteId,
      ceilingForRoute,
      isChork,
      serverBoard.rows,
      scoredHere,
    ],
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

  /**
   * The allowance for the open round, fetched because it depends on
   * the setter's attempt count and those are private to them.
   * Keyed on route + seat so switching either refetches.
   */
  const [chorkAllowance, setChorkAllowance] = useState<{
    key: string;
    value: number | null;
  } | null>(null);

  const loadChorkAllowance = useCallback(
    (routeId: string, playerId?: string) => {
      const key = `${routeId}:${playerId ?? "me"}`;
      startTransition(async () => {
        const result = await fetchChorkAllowance(
          initialState.match.id,
          routeId,
          playerId,
        );
        if ("error" in result) return;
        setChorkAllowance({ key, value: result.allowance });
      });
    },
    [initialState.match.id],
  );

  const openPanel = useCallback(
    (panel: MatchPanel) => {
      dispatch({ type: "open-panel", panel });
      // Opening a round is the moment to find out how many goes it
      // carries. Fetched rather than derived because the allowance
      // depends on the setter's attempt count, which is theirs alone.
      if (isChork && panel.kind === "log") {
        loadChorkAllowance(panel.routeId, panel.playerId);
      }
    },
    [isChork, loadChorkAllowance],
  );
  const closePanel = useCallback(() => dispatch({ type: "close-panel" }), []);

  const handleAddRoute = useCallback(
    async (payload: {
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
    }) => {
      startTransition(async () => {
        const result = await addMatchRouteAction({
          matchId: initialState.match.id,
          description: payload.description,
          grade: payload.grade,
          hasZone: payload.hasZone,
          discipline: payload.discipline,
          playerId: payload.playerId ?? null,
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
            has_left: false,
            // The host declares these separately, after seating them.
            ceiling: null,
            alt_ceiling: null,
          },
        });
        dispatch({ type: "close-panel" });
      });
    },
    [initialState.match.id],
  );

  const handleSetCeiling = useCallback(
    async (
      playerId: string,
      ceiling: number | null,
      altCeiling: number | null,
    ) => {
      startTransition(async () => {
        const result = await setMatchCeilingAction(
          initialState.match.id,
          playerId,
          ceiling,
          altCeiling,
        );
        if ("error" in result) {
          showToast(result.error, "error");
          return;
        }
        // Patch locally so the board re-scores immediately — the
        // handicap is recomputed from `players`, so without this the
        // change wouldn't show until a refresh.
        dispatch({ type: "set-ceiling", playerId, ceiling, altCeiling });
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

  /**
   * Park your seat and go.
   *
   * Straight to the Match list rather than the summary: the Match is
   * still running for everyone else, and dropping the leaver on a
   * result page for a live contest reads as though it ended.
   */

  const handleConcede = useCallback(
    (routeId: string, playerId?: string) => {
      startTransition(async () => {
        const result = await concedeChorkRound(
          initialState.match.id,
          routeId,
          playerId,
        );
        if ("error" in result) {
          showToast(result.error, "error");
          return;
        }
        dispatch({ type: "close-panel" });
        scheduleChork(undefined);
        router.refresh();
      });
    },
    [initialState.match.id, router, scheduleChork],
  );

  /**
   * The setter's way out, and the only thing that moves the pen. The
   * route leaves the room optimistically — the realtime UPDATE that
   * follows carries `withdrawn_at`, which the reducer treats as a
   * removal, so the echo is a no-op rather than a resurrection.
   */
  const handleWithdraw = useCallback(
    (routeId: string, playerId?: string | null) => {
      startTransition(async () => {
        const result = await withdrawChorkRoute(
          initialState.match.id,
          routeId,
          playerId,
        );
        if ("error" in result) {
          showToast(result.error, "error");
          return;
        }
        dispatch({ type: "remove-route", id: routeId });
        dispatch({ type: "close-panel" });
        scheduleChork(undefined);
        router.refresh();
      });
    },
    [initialState.match.id, router, scheduleChork],
  );

  const handleLeave = useCallback(() => {
    startTransition(async () => {
      const result = await leaveMatchAction(initialState.match.id);
      if ("error" in result) {
        showToast(result.error, "error");
        return;
      }
      router.push("/match");
    });
  }, [initialState.match.id, router]);

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

  const handleDelete = useCallback(() => {
    // Leaving from the press, not the answer: the deletion's own events
    // reach this device before the action returns, and none of them may
    // toast a second time or leave work in the router queue for the
    // navigation below to lose (see leavingRef).
    leavingRef.current = "deleting";
    cancelBoard();
    cancelChork();
    startTransition(async () => {
      const result = await deleteMatchAction(initialState.match.id);
      if ("error" in result) {
        leavingRef.current = null;
        showToast(result.error, "error");
        return;
      }
      showToast("Game deleted");
      router.replace("/match");
    });
  }, [initialState.match.id, router, cancelBoard, cancelChork]);

  // The setup lives on `initialState.match`, a server prop: a refresh
  // re-reads it, and the sheet closes on the fresh props rather than
  // on a guess. Returns whether it saved, so a sheet can stay open on
  // a refusal (the RPC's own words are already toasted).
  const handleSetup = useCallback(
    async (payload: MatchSetupPayload): Promise<boolean> => {
      const result = await setMatchSetupAction(initialState.match.id, payload);
      if ("error" in result) {
        showToast(result.error, "error");
        return false;
      }
      startTransition(() => {
        router.refresh();
        dispatch({ type: "close-panel" });
      });
      return true;
    },
    [initialState.match.id, router],
  );

  const handleGameMode = useCallback(
    (mode: "points" | "chork") => {
      startTransition(async () => {
        const result = await setMatchGameMode(initialState.match.id, mode);
        if ("error" in result) {
          showToast(result.error, "error");
          return;
        }
        router.refresh();
        dispatch({ type: "close-panel" });
      });
    },
    [initialState.match.id, router],
  );

  return {
    state,
    leaderboard,
    myLogByRouteId,
    isPending,
    openPanel,
    handleSetup,
    handleGameMode,
    closePanel,
    handleAddRoute,
    handleAddGuest,
    handleRemoveGuest,
    handleSetCeiling,
    handleUpdateRoute,
    handleLog,
    handleEnd,
    handleLeave,
    handleDelete,
    isChork,
    chorkLetters: chork.letters,
    chorkPenSeatId: chork.penSeatId,
    chorkAllowance,
    handleConcede,
    handleWithdraw,
  };
}
