"use client";

import { FaPlus, FaEllipsisVertical, FaFlag } from "react-icons/fa6";
import { LeaderboardRow } from "@/components/ui";
import type { JamState } from "@/lib/data/jam-types";
import { JamGrid } from "./JamGrid";
import { JamLogSheet } from "./JamLogSheet";
import { JamAddRouteSheet } from "./JamAddRouteSheet";
import { JamMenuSheet } from "./JamMenuSheet";
import { JamPlayerGridSheet } from "./JamPlayerGridSheet";
import { useJamScreenState } from "./useJamScreenState";
import styles from "./jamScreen.module.scss";

interface Props {
  initialState: JamState;
  userId: string;
}

/**
 * Live jam room — purely the JSX tree. All state, realtime wiring,
 * optimistic writes, and panel exclusivity live in `useJamScreenState`
 * (+ jamScreenReducer), matching the RouteLogSheet / SettingsSheet
 * split.
 */
export function JamScreen({ initialState, userId }: Props) {
  const {
    state,
    leaderboard,
    myLogByRouteId,
    isPending,
    openPanel,
    closePanel,
    handleAddRoute,
    handleUpdateRoute,
    handleLog,
    handleEnd,
  } = useJamScreenState({ initialState, userId });

  const { panel } = state;
  // Panels store route ids and derive the row at render time so a
  // route edited (or deleted) via realtime never renders from a stale
  // snapshot; a deleted route simply closes its sheet.
  const activeRoute =
    panel.kind === "log"
      ? state.routes.find((r) => r.id === panel.routeId) ?? null
      : null;
  const editRoute =
    panel.kind === "edit"
      ? state.routes.find((r) => r.id === panel.routeId) ?? null
      : null;
  const peekedPlayer =
    panel.kind === "peek"
      ? state.players.find((p) => p.user_id === panel.playerId) ?? null
      : null;

  return (
    <main className={styles.screen}>
      <header className={styles.hero}>
        <div className={styles.heroBody}>
          <h1 className={styles.title}>
            {initialState.jam.name?.trim() || "Untitled jam"}
          </h1>
          <div className={styles.metaRow}>
            <span className={styles.metaChip}>
              {state.players.length}{" "}
              {state.players.length === 1 ? "player" : "players"}
            </span>
            {initialState.jam.location && (
              <span className={styles.metaChip}>{initialState.jam.location}</span>
            )}
            <button
              type="button"
              className={styles.codeChip}
              onClick={() => openPanel({ kind: "menu" })}
              aria-label={`Join code ${initialState.jam.code}. Tap to share.`}
            >
              <span className={styles.codeLabel}>Code</span>
              {initialState.jam.code}
            </button>
          </div>
        </div>
        <button
          type="button"
          className={styles.menuButton}
          onClick={() => openPanel({ kind: "menu" })}
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
                // Tapping any row (including your own) peeks the
                // climber's per-route grid. Their logs are already in
                // state.logs via realtime (sanitised by the reducer's
                // privacy gate), so the peek is a zero-fetch sheet.
                onPress={() => openPanel({ kind: "peek", playerId: row.user_id })}
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
        onTileTap={(route) => openPanel({ kind: "log", routeId: route.id })}
        onAddTap={() => openPanel({ kind: "add" })}
        onTileLongPress={(route) => openPanel({ kind: "edit", routeId: route.id })}
      />

      {activeRoute && (
        <JamLogSheet
          route={activeRoute}
          log={myLogByRouteId.get(activeRoute.id) ?? null}
          grades={initialState.grades}
          gradingScale={initialState.jam.grading_scale}
          onClose={closePanel}
          onEdit={() => openPanel({ kind: "edit", routeId: activeRoute.id })}
          onSubmit={(payload) => handleLog(activeRoute, payload)}
        />
      )}

      {panel.kind === "add" && (
        <JamAddRouteSheet
          mode="add"
          grades={initialState.grades}
          gradingScale={initialState.jam.grading_scale}
          minGrade={initialState.jam.min_grade}
          maxGrade={initialState.jam.max_grade}
          onClose={closePanel}
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
          onClose={closePanel}
          onSubmit={(payload) => handleUpdateRoute(editRoute.id, payload)}
          pending={isPending}
        />
      )}

      {panel.kind === "menu" && (
        <JamMenuSheet
          jam={initialState.jam}
          onClose={closePanel}
          onEnd={handleEnd}
          pending={isPending}
        />
      )}

      {peekedPlayer && (
        <JamPlayerGridSheet
          player={peekedPlayer}
          row={leaderboard.find((r) => r.user_id === peekedPlayer.user_id)}
          routes={state.routes}
          logs={state.logs}
          grades={initialState.grades}
          gradingScale={initialState.jam.grading_scale}
          onClose={closePanel}
        />
      )}

      <button
        type="button"
        className={styles.floatingAdd}
        onClick={() => openPanel({ kind: "add" })}
        aria-label="Add route"
      >
        <FaPlus aria-hidden />
      </button>
    </main>
  );
}
