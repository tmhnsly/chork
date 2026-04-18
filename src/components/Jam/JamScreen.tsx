"use client";

import { useCallback, useMemo, useReducer, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FaPlus, FaEllipsisVertical, FaFlag } from "react-icons/fa6";
import { LeaderboardRow, showToast } from "@/components/ui";
import { useJamRealtime } from "@/hooks/use-jam-realtime";
import { computeJamLeaderboard } from "@/lib/data/jam-leaderboard";
import type {
  JamState,
  JamRoute,
  JamLog,
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
import { jamReducer, logKey, type JamLocalState } from "./jamScreenReducer";
import styles from "./jamScreen.module.scss";

interface Props {
  initialState: JamState;
  userId: string;
}

export function JamScreen({ initialState, userId }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [state, dispatch] = useReducer(
    jamReducer,
    {
      routes: initialState.routes,
      players: initialState.players,
      logs: new Map(
        initialState.my_logs.map((log) => [logKey(log.user_id, log.jam_route_id), log]),
      ),
    } as JamLocalState,
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
        dispatch({ type: "remove-route", id: evt.old.id });
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

      <ul className={styles.leaderboardStrip} aria-label="Leaderboard">
        {leaderboard.slice(0, 5).map((row) => {
          const isSelf = row.user_id === userId;
          return (
            <li key={row.user_id}>
              <LeaderboardRow
                entry={{
                  userId: row.user_id,
                  username: row.username,
                  name: row.display_name,
                  avatarUrl: row.avatar_url,
                  rank: row.rank,
                  points: row.points,
                  flashes: row.flashes,
                }}
                highlighted={isSelf}
                interactive={false}
                trailing={
                  row.zones > 0 ? (
                    <span
                      className={styles.zoneCount}
                      aria-label={`${row.zones} zones`}
                    >
                      <FaFlag aria-hidden /> {row.zones}
                    </span>
                  ) : null
                }
              />
            </li>
          );
        })}
      </ul>

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

