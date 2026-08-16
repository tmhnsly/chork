"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useState,
  useTransition,
} from "react";
import { useDebouncedFlush } from "@/hooks/use-debounced-flush";
import { useRouter } from "next/navigation";
import { showToast } from "@/components/ui";
import { useMatchRealtime } from "@/hooks/use-match-realtime";
import { computeMatchLeaderboard } from "@/lib/data/match-leaderboard";
import type { MatchState, MatchRoute, MatchLog } from "@/lib/data/match-types";
import { disciplineFamily, type Discipline } from "@/lib/data/grade-label";
import { ownerIdOf } from "@/lib/data/match-types";
import {
  addMatchRouteAction,
  updateMatchRouteAction,
  endMatchAction,
  leaveMatchAction,
  fetchChorkStandings,
  fetchChorkAllowance,
  concedeChorkRound,
  withdrawChorkRoute,
  addMatchGuestAction,
  setMatchCeilingAction,
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

  const { schedule: scheduleChork } = useDebouncedFlush<void>({
    delayMs: 1000,
    flush: async () => {
      const next = await loadChork();
      if (next) setChork(next);
    },
  });

  useMatchRealtime(initialState.match.id, {
    onRouteChange: (evt) => {
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
      // Anyone's log can change who owes a letter, so this listens to
      // every log event rather than only the viewer's own.
      if (isChork) scheduleChork(undefined);
    },
    onPlayerChange: () => {
      // Player changes come as scattered events — a full state
      // refresh is cheaper to reason about than hand-patched set
      // maths when someone joins or leaves. The refreshed roster
      // reaches the reducer via the render-time sync above.
      router.refresh();
    },
    onMatchChange: (evt) => {
      // The host ended it. Everyone else is looking at a board that
      // has silently stopped accepting writes, so move them to the
      // result rather than let them tap into a dead screen.
      //
      // `replace`, not `push`: back from the summary should reach
      // wherever they came from, not a live screen that no longer is.
      if (evt.new?.status === "archived") {
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
  //
  // A ceiling is ONE number in ONE scale — the Match's own. On a mixed
  // day an off-family route's ordinal is not comparable to it: a 6b
  // rope and a V6 boulder are both ordinal 6, so scoring the rope
  // against a V4 ceiling would read as "two grades above your limit"
  // on a scale the climber never gave a limit for. Those routes go in
  // with a null grade, which `handicapPointsTenths` already scores at
  // full value — the same "guessing is worse than not helping" rule
  // the Chork allowance uses for an unknown.
  const gradeByRouteId = useMemo(
    () =>
      new Map(
        state.routes.map((r) => [
          r.id,
          disciplineFamily(r.discipline ?? initialState.match.discipline)
            === disciplineFamily(initialState.match.discipline)
            ? r.declared_grade ?? r.community_grade ?? null
            : null,
        ]),
      ),
    [state.routes, initialState.match.discipline],
  );

  const leaderboard = useMemo(
    () =>
      computeMatchLeaderboard(state.players, state.logs, {
        handicap: initialState.match.handicap,
        gradeByRouteId,
      }),
    [state.players, state.logs, initialState.match.handicap, gradeByRouteId],
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
            // The host declares it separately, after seating them.
            ceiling: null,
          },
        });
        dispatch({ type: "close-panel" });
      });
    },
    [initialState.match.id],
  );

  const handleSetCeiling = useCallback(
    async (playerId: string, ceiling: number | null) => {
      startTransition(async () => {
        const result = await setMatchCeilingAction(
          initialState.match.id,
          playerId,
          ceiling,
        );
        if ("error" in result) {
          showToast(result.error, "error");
          return;
        }
        // Patch locally so the board re-scores immediately — the
        // handicap is recomputed from `players`, so without this the
        // change wouldn't show until a refresh.
        dispatch({ type: "set-ceiling", playerId, ceiling });
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
    handleSetCeiling,
    handleUpdateRoute,
    handleLog,
    handleEnd,
    handleLeave,
    isChork,
    chorkLetters: chork.letters,
    chorkPenSeatId: chork.penSeatId,
    chorkAllowance,
    handleConcede,
    handleWithdraw,
  };
}
