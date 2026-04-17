"use client";

import { useCallback, useMemo, useReducer, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FaPlus, FaEllipsisVertical, FaCrown, FaBolt, FaFlag } from "react-icons/fa6";
import { showToast } from "@/components/ui";
import { useJamRealtime } from "@/hooks/use-jam-realtime";
import type {
  JamState,
  JamRoute,
  JamLog,
  JamPlayerView,
  JamLeaderboardRow,
} from "@/lib/data/jam-types";
import {
  addJamRouteAction,
  updateJamRouteAction,
  endJamAction,
} from "@/app/jam/actions";
import { upsertJamLogOffline } from "@/app/jam/offline-actions";
import { JamGrid } from "./JamGrid";
import { JamLogSheet } from "./JamLogSheet";
import { JamAddRouteSheet } from "./JamAddRouteSheet";
import { JamMenuSheet } from "./JamMenuSheet";
import styles from "./jamScreen.module.scss";

interface Props {
  initialState: JamState;
  userId: string;
}

// Local state model. Realtime events patch this in place so the
// screen paints optimistic-fast without re-fetching get_jam_state
// on every tick. Truth-of-record is still the server — any
// mismatch resolves on the next realtime event or page refresh.
interface LocalState {
  routes: JamRoute[];
  players: JamPlayerView[];
  // Logs keyed by (user_id, jam_route_id) for O(1) upserts.
  logs: Map<string, JamLog>;
}

type Action =
  | { type: "set-routes"; routes: JamRoute[] }
  | { type: "upsert-route"; route: JamRoute }
  | { type: "set-players"; players: JamPlayerView[] }
  | { type: "upsert-log"; log: JamLog }
  | { type: "remove-log"; userId: string; routeId: string };

function logKey(userId: string, routeId: string) {
  return `${userId}:${routeId}`;
}

function reducer(state: LocalState, action: Action): LocalState {
  switch (action.type) {
    case "set-routes":
      return { ...state, routes: action.routes };
    case "upsert-route": {
      const existingIdx = state.routes.findIndex((r) => r.id === action.route.id);
      const next =
        existingIdx >= 0
          ? state.routes.map((r) => (r.id === action.route.id ? action.route : r))
          : [...state.routes, action.route];
      next.sort((a, b) => a.number - b.number);
      return { ...state, routes: next };
    }
    case "set-players":
      return { ...state, players: action.players };
    case "upsert-log": {
      const logs = new Map(state.logs);
      logs.set(logKey(action.log.user_id, action.log.jam_route_id), action.log);
      return { ...state, logs };
    }
    case "remove-log": {
      const logs = new Map(state.logs);
      logs.delete(logKey(action.userId, action.routeId));
      return { ...state, logs };
    }
    default:
      return state;
  }
}

export function JamScreen({ initialState, userId }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [state, dispatch] = useReducer(
    reducer,
    {
      routes: initialState.routes,
      players: initialState.players,
      logs: new Map(
        initialState.my_logs.map((log) => [logKey(log.user_id, log.jam_route_id), log]),
      ),
    } as LocalState,
  );

  const [activeRouteId, setActiveRouteId] = useState<string | null>(null);
  const [addSheetOpen, setAddSheetOpen] = useState(false);
  const [editRoute, setEditRoute] = useState<JamRoute | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  // Subscribe to realtime events for the jam.
  useJamRealtime(initialState.jam.id, {
    onRouteChange: (payload) => {
      const evt = payload as {
        eventType: "INSERT" | "UPDATE" | "DELETE";
        new: JamRoute;
        old: JamRoute;
      };
      if (evt.eventType === "DELETE") {
        dispatch({ type: "set-routes", routes: state.routes.filter((r) => r.id !== evt.old.id) });
      } else {
        dispatch({ type: "upsert-route", route: evt.new });
      }
    },
    onLogChange: (payload) => {
      const evt = payload as {
        eventType: "INSERT" | "UPDATE" | "DELETE";
        new: JamLog;
        old: JamLog;
      };
      if (evt.eventType === "DELETE") {
        dispatch({ type: "remove-log", userId: evt.old.user_id, routeId: evt.old.jam_route_id });
      } else {
        dispatch({ type: "upsert-log", log: evt.new });
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
  // server-side formula in get_jam_leaderboard exactly so the
  // display doesn't desync with the summary calculation on end.
  const leaderboard = useMemo(() => {
    return computeJamLeaderboard(state.players, state.logs);
  }, [state.players, state.logs]);

  // Logs keyed by route id, just the current user. Drives tile
  // state derivation + log-sheet pre-fill.
  const myLogByRouteId = useMemo(() => {
    const map = new Map<string, JamLog>();
    for (const log of state.logs.values()) {
      if (log.user_id === userId) map.set(log.jam_route_id, log);
    }
    return map;
  }, [state.logs, userId]);

  const activeRoute = state.routes.find((r) => r.id === activeRouteId) ?? null;

  const handleTileTap = useCallback(
    (route: JamRoute) => {
      setActiveRouteId(route.id);
    },
    [],
  );

  const handleAddRoute = useCallback(
    async (payload: { description: string | null; grade: number | null; hasZone: boolean }) => {
      startTransition(async () => {
        const result = await addJamRouteAction({
          jamId: initialState.jam.id,
          description: payload.description,
          grade: payload.grade,
          hasZone: payload.hasZone,
        });
        if ("error" in result) {
          showToast(result.error, "error");
          return;
        }
        setAddSheetOpen(false);
      });
    },
    [initialState.jam.id],
  );

  const handleUpdateRoute = useCallback(
    async (
      routeId: string,
      payload: { description: string | null; grade: number | null; hasZone: boolean },
    ) => {
      startTransition(async () => {
        const result = await updateJamRouteAction({
          routeId,
          description: payload.description,
          grade: payload.grade,
          hasZone: payload.hasZone,
        });
        if ("error" in result) {
          showToast(result.error, "error");
          return;
        }
        setEditRoute(null);
      });
    },
    [],
  );

  const handleLog = useCallback(
    async (payload: { attempts: number; completed: boolean; zone: boolean }) => {
      if (!activeRoute) return;
      const previous = myLogByRouteId.get(activeRoute.id);
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
        log: {
          id: previous?.id ?? `optimistic-${activeRoute.id}`,
          jam_id: initialState.jam.id,
          jam_route_id: activeRoute.id,
          user_id: userId,
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
        // on (user_id, jam_route_id) so replays never duplicate.
        const result = await upsertJamLogOffline({
          jamRouteId: activeRoute.id,
          attempts: payload.attempts,
          completed: payload.completed,
          zone: payload.zone,
        });
        if (result && typeof result === "object" && "error" in result) {
          showToast((result as { error: string }).error, "error");
          // Roll back to the previous log if the action rejected.
          if (previous) {
            dispatch({ type: "upsert-log", log: previous });
          } else {
            dispatch({
              type: "remove-log",
              userId,
              routeId: activeRoute.id,
            });
          }
        }
      });
    },
    [activeRoute, initialState.jam.id, myLogByRouteId, userId],
  );

  const handleEnd = useCallback(() => {
    startTransition(async () => {
      const result = await endJamAction(initialState.jam.id);
      if ("error" in result) {
        showToast(result.error, "error");
        return;
      }
      router.push(`/jam/summary/${result.summaryId}?fresh=1`);
    });
  }, [initialState.jam.id, router]);

  return (
    <main className={styles.screen}>
      <header className={styles.header}>
        <div className={styles.headerBody}>
          <h1 className={styles.title}>
            {initialState.jam.name?.trim() || "Untitled jam"}
          </h1>
          <div className={styles.meta}>
            {initialState.jam.location && <span>{initialState.jam.location}</span>}
            <span>
              {state.players.length}{" "}
              {state.players.length === 1 ? "player" : "players"}
            </span>
            <span className={styles.code}>Code {initialState.jam.code}</span>
          </div>
        </div>
        <button
          type="button"
          className={styles.menuButton}
          onClick={() => setMenuOpen(true)}
          aria-label="Jam menu"
        >
          <FaEllipsisVertical aria-hidden />
        </button>
      </header>

      <section className={styles.leaderboardStrip} aria-label="Leaderboard">
        {leaderboard.slice(0, 5).map((row) => (
          <div key={row.user_id} className={styles.leaderRow}>
            <span className={styles.rank}>
              {row.rank === 1 ? <FaCrown aria-hidden /> : `#${row.rank}`}
            </span>
            <span className={styles.username}>
              @{row.username ?? "unknown"}
            </span>
            <span className={styles.points}>
              <FaBolt aria-hidden />
              {row.flashes}
              <FaFlag aria-hidden />
              {row.zones}
              <strong>{row.points}</strong>
            </span>
          </div>
        ))}
      </section>

      <JamGrid
        routes={state.routes}
        myLogs={myLogByRouteId}
        grades={initialState.grades}
        gradingScale={initialState.jam.grading_scale}
        onTileTap={handleTileTap}
        onAddTap={() => setAddSheetOpen(true)}
        onTileLongPress={(route) => setEditRoute(route)}
      />

      {activeRoute && (
        <JamLogSheet
          route={activeRoute}
          log={myLogByRouteId.get(activeRoute.id) ?? null}
          grades={initialState.grades}
          gradingScale={initialState.jam.grading_scale}
          onClose={() => setActiveRouteId(null)}
          onEdit={() => {
            setEditRoute(activeRoute);
            setActiveRouteId(null);
          }}
          onSubmit={handleLog}
          pending={isPending}
        />
      )}

      {addSheetOpen && (
        <JamAddRouteSheet
          mode="add"
          grades={initialState.grades}
          gradingScale={initialState.jam.grading_scale}
          minGrade={initialState.jam.min_grade}
          maxGrade={initialState.jam.max_grade}
          onClose={() => setAddSheetOpen(false)}
          onSubmit={handleAddRoute}
          pending={isPending}
        />
      )}

      {editRoute && (
        <JamAddRouteSheet
          mode="edit"
          route={editRoute}
          grades={initialState.grades}
          gradingScale={initialState.jam.grading_scale}
          minGrade={initialState.jam.min_grade}
          maxGrade={initialState.jam.max_grade}
          onClose={() => setEditRoute(null)}
          onSubmit={(payload) => handleUpdateRoute(editRoute.id, payload)}
          pending={isPending}
        />
      )}

      {menuOpen && (
        <JamMenuSheet
          jam={initialState.jam}
          onClose={() => setMenuOpen(false)}
          onEnd={handleEnd}
          pending={isPending}
        />
      )}

      <button
        type="button"
        className={styles.floatingAdd}
        onClick={() => setAddSheetOpen(true)}
        aria-label="Add route"
      >
        <FaPlus aria-hidden />
      </button>
    </main>
  );
}

// ── Leaderboard derivation ────────────────────────
// Mirror of the server-side formula in get_jam_leaderboard. Client-
// side derivation keeps the board reactive to local + realtime
// events without another round trip per edit.

function computeJamLeaderboard(
  players: JamPlayerView[],
  logs: Map<string, JamLog>,
): JamLeaderboardRow[] {
  const rows: JamLeaderboardRow[] = players.map((p) => {
    let sends = 0;
    let flashes = 0;
    let zones = 0;
    let points = 0;
    let attempts = 0;
    let lastSendAt: string | null = null;

    for (const log of logs.values()) {
      if (log.user_id !== p.user_id) continue;
      attempts += log.attempts;
      if (log.zone) {
        zones += 1;
        points += 1;
      }
      if (log.completed) {
        sends += 1;
        if (log.attempts === 1) {
          flashes += 1;
          points += 4;
        } else if (log.attempts === 2) {
          points += 3;
        } else if (log.attempts === 3) {
          points += 2;
        } else {
          points += 1;
        }
        if (
          log.completed_at &&
          (!lastSendAt || log.completed_at > lastSendAt)
        ) {
          lastSendAt = log.completed_at;
        }
      }
    }

    return {
      user_id: p.user_id,
      username: p.username ?? null,
      display_name: p.display_name ?? null,
      avatar_url: p.avatar_url ?? null,
      sends,
      flashes,
      zones,
      points,
      attempts,
      last_send_at: lastSendAt,
      rank: 0, // assigned after sort
    };
  });

  rows.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.flashes !== a.flashes) return b.flashes - a.flashes;
    if (b.sends !== a.sends) return b.sends - a.sends;
    // Earliest last send wins ties after that (encourages speed).
    if (a.last_send_at && b.last_send_at) {
      return a.last_send_at.localeCompare(b.last_send_at);
    }
    return 0;
  });

  let prevKey = "";
  let rank = 0;
  for (let i = 0; i < rows.length; i++) {
    const key = `${rows[i].points}|${rows[i].flashes}|${rows[i].sends}`;
    if (key !== prevKey) {
      rank = i + 1;
      prevKey = key;
    }
    rows[i].rank = rank;
  }
  return rows;
}
