"use client";

import { FaPlus, FaEllipsisVertical, FaFlag } from "react-icons/fa6";
import { LeaderboardRow } from "@/components/ui";
import type { MatchState } from "@/lib/data/match-types";
import { ownerIdOf } from "@/lib/data/match-types";
import { MatchGrid } from "./MatchGrid";
import { MatchLogSheet } from "./MatchLogSheet";
import { MatchAddRouteSheet } from "./MatchAddRouteSheet";
import { MatchMenuSheet } from "./MatchMenuSheet";
import { AddGuestSheet } from "./AddGuestSheet";
import { MatchPlayerGridSheet } from "./MatchPlayerGridSheet";
import { useMatchScreenState } from "./useMatchScreenState";
import styles from "./matchScreen.module.scss";

interface Props {
  initialState: MatchState;
  userId: string;
}

/**
 * Live match room — purely the JSX tree. All state, realtime wiring,
 * optimistic writes, and panel exclusivity live in `useMatchScreenState`
 * (+ matchScreenReducer), matching the RouteLogSheet / SettingsSheet
 * split.
 */
export function MatchScreen({ initialState, userId }: Props) {
  const isHost = initialState.match.host_id === userId;

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
    handleAddGuest,
    handleEnd,
  } = useMatchScreenState({ initialState, userId });

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
            {initialState.match.name?.trim() || "Untitled match"}
          </h1>
          <div className={styles.metaRow}>
            <span className={styles.metaChip}>
              {state.players.length}{" "}
              {state.players.length === 1 ? "player" : "players"}
            </span>
            {initialState.match.location && (
              <span className={styles.metaChip}>{initialState.match.location}</span>
            )}
            <button
              type="button"
              className={styles.codeChip}
              onClick={() => openPanel({ kind: "menu" })}
              aria-label={`Join code ${initialState.match.code}. Tap to share.`}
            >
              <span className={styles.codeLabel}>Code</span>
              {initialState.match.code}
            </button>
          </div>
        </div>
        <button
          type="button"
          className={styles.menuButton}
          onClick={() => openPanel({ kind: "menu" })}
          aria-label="Match menu"
        >
          <FaEllipsisVertical aria-hidden />
        </button>
      </header>

      <ul className={styles.leaderboardStrip} aria-label="Leaderboard">
        {leaderboard.slice(0, 5).map((row) => {
          const isSelf = row.user_id === userId;
          return (
            <li key={row.player_id}>
              <LeaderboardRow
                entry={{
                  userId: ownerIdOf(row),
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
                onPress={() => openPanel({ kind: "peek", playerId: ownerIdOf(row) })}
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

      <MatchGrid
        routes={state.routes}
        myLogs={myLogByRouteId}
        grades={initialState.grades}
        gradingScale={initialState.match.grading_scale}
        onTileTap={(route) => openPanel({ kind: "log", routeId: route.id })}
        onAddTap={() => openPanel({ kind: "add" })}
        onTileLongPress={(route) => openPanel({ kind: "edit", routeId: route.id })}
      />

      {activeRoute && (
        <MatchLogSheet
          route={activeRoute}
          log={myLogByRouteId.get(activeRoute.id) ?? null}
          grades={initialState.grades}
          gradingScale={initialState.match.grading_scale}
          matchDiscipline={initialState.match.discipline}
          onClose={closePanel}
          onEdit={() => openPanel({ kind: "edit", routeId: activeRoute.id })}
          onSubmit={(payload) =>
            handleLog(activeRoute, payload, panel.kind === "log" ? panel.playerId : undefined)
          }
        />
      )}

      {panel.kind === "add" && (
        <MatchAddRouteSheet
          mode="add"
          grades={initialState.grades}
          gradingScale={initialState.match.grading_scale}
          minGrade={initialState.match.min_grade}
          maxGrade={initialState.match.max_grade}
          matchDiscipline={initialState.match.discipline}
          onClose={closePanel}
          onSubmit={handleAddRoute}
          pending={isPending}
        />
      )}

      {editRoute && (
        <MatchAddRouteSheet
          mode="edit"
          route={editRoute}
          grades={initialState.grades}
          gradingScale={initialState.match.grading_scale}
          minGrade={initialState.match.min_grade}
          maxGrade={initialState.match.max_grade}
          matchDiscipline={initialState.match.discipline}
          onClose={closePanel}
          onSubmit={(payload) => handleUpdateRoute(editRoute.id, payload)}
          pending={isPending}
        />
      )}

      {panel.kind === "menu" && (
        <MatchMenuSheet
          match={initialState.match}
          isHost={isHost}
          onAddGuest={() => openPanel({ kind: "add-guest" })}
          onClose={closePanel}
          onEnd={handleEnd}
          pending={isPending}
        />
      )}

      {panel.kind === "add-guest" && (
        <AddGuestSheet
          onClose={closePanel}
          onSubmit={handleAddGuest}
          pending={isPending}
        />
      )}

      {peekedPlayer && (
        <MatchPlayerGridSheet
          player={peekedPlayer}
          row={leaderboard.find((r) => r.player_id === peekedPlayer.player_id)}
          // The host enters a guest's sends, so from their grid the
          // host can open the log sheet on any route. Everyone else
          // (and the host on an account-backed player) gets a
          // read-only peek.
          onLogRoute={
            isHost && peekedPlayer.is_guest
              ? (routeId) =>
                  openPanel({
                    kind: "log",
                    routeId,
                    playerId: peekedPlayer.player_id,
                  })
              : undefined
          }
          routes={state.routes}
          logs={state.logs}
          grades={initialState.grades}
          gradingScale={initialState.match.grading_scale}
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
