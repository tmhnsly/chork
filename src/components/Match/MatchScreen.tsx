"use client";

import { useState } from "react";
import { FaPlus, FaEllipsisVertical, FaFlag } from "react-icons/fa6";
import { LeaderboardRow } from "@/components/ui";
import type { MatchState } from "@/lib/data/match-types";
import { ownerIdOf } from "@/lib/data/match-types";
import { formatHandicapPoints } from "@/lib/data/handicap";
import { makeGradeLabeller } from "@/lib/data/grade-label";
import { visibleBoardRows, BOARD_PREVIEW_SIZE } from "@/lib/data/match-board";
import { countOf } from "@/lib/plural";
import { ChorkBoard } from "./ChorkBoard";
import { MatchGrid } from "./MatchGrid";
import { MatchLogSheet } from "./MatchLogSheet";
import { MatchAddRouteSheet } from "./MatchAddRouteSheet";
import { MatchMenuSheet } from "./MatchMenuSheet";
import { AddGuestSheet } from "./AddGuestSheet";
import { InviteFriendsSheet } from "./InviteFriendsSheet";
import { CeilingSheet } from "./CeilingSheet";
import { MatchPlayerGridSheet } from "./MatchPlayerGridSheet";
import { logKey } from "./matchScreenReducer";
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
    handleSetCeiling,
    handleEnd,
    handleLeave,
    isChork,
    chorkLetters,
    chorkPenSeatId,
    chorkAllowance,
    handleConcede,
    handleWithdraw,
  } = useMatchScreenState({ initialState, userId });

  // The board shows the top of the table and you, always — see
  // match-board.ts for why the bare top-5 was a bug.
  const [boardExpanded, setBoardExpanded] = useState(false);
  const board = visibleBoardRows(
    leaderboard,
    (row) => row.user_id === userId,
    boardExpanded,
  );

  // Who may put up the next route. Points: anyone. Chork: whoever
  // holds the pen — or the host, when the pen sits with a guest, since
  // a guest has no session to tap with.
  //
  // A null pen means the standings haven't landed (or the fetch
  // failed), and that degrades to open rather than shut: locking the
  // button on "don't know yet" would leave a whole match unable to
  // start over one bad response.
  const penPlayer =
    isChork && chorkPenSeatId
      ? state.players.find((p) => p.player_id === chorkPenSeatId) ?? null
      : null;
  const canSet =
    !isChork ||
    penPlayer === null ||
    penPlayer.user_id === userId ||
    (isHost && penPlayer.is_guest);

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
  // Matched on the SEAT, not the account. The board passes
  // `ownerIdOf(row)`, which is a guest's `player_id` — looking them up
  // by `user_id` would never find one, since a guest hasn't got one.
  const peekedPlayer =
    panel.kind === "peek"
      ? state.players.find((p) => ownerIdOf(p) === panel.playerId) ?? null
      : null;

  // Same labeller the grade pickers use, so a limit reads in the
  // Match's own scale rather than as a bare index.
  const labelForCeiling = (ceiling: number | null) =>
    ceiling === null
      ? null
      : makeGradeLabeller(
          initialState.match.grading_scale,
          initialState.grades,
        )(ceiling);

  // Which seat the open log sheet is writing to: a guest when the
  // host tapped through their grid, otherwise the viewer's own.
  const loggingPlayer =
    panel.kind === "log"
      ? state.players.find((p) =>
          panel.playerId
            ? p.player_id === panel.playerId
            : p.user_id === userId,
        ) ?? null
      : null;

  // The log belongs to the SEAT being logged for, not to the viewer.
  // Passing the viewer's own meant a host opening a guest's round saw
  // their own attempts and send on it — "Route 1 — Dave" showing Tom's
  // 2 goes and a tick.
  const sheetLog =
    activeRoute && loggingPlayer?.is_guest
      ? state.logs.get(logKey(loggingPlayer.player_id, activeRoute.id)) ?? null
      : activeRoute
        ? myLogByRouteId.get(activeRoute.id) ?? null
        : null;

  const ceilingPlayer =
    panel.kind === "ceiling"
      ? state.players.find((p) => p.player_id === panel.playerId) ?? null
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
              {countOf(state.players.length, "player")}
            </span>
            {initialState.match.location && (
              <span className={styles.metaChip}>{initialState.match.location}</span>
            )}
            {/* Say so. A player whose score is being adjusted against
                their own limit should not have to work that out from
                the numbers not adding up. */}
            {initialState.match.handicap && (
              <span className={styles.metaChip}>Handicap</span>
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

      {/* Chork has no points, so it has no points board. Same
          players, same routes — a different question being asked. */}
      {isChork ? (
        <ChorkBoard
          players={state.players}
          lettersBySeat={chorkLetters}
          penSeatId={chorkPenSeatId}
          viewerId={userId}
          onPress={(seatId) => openPanel({ kind: "peek", playerId: seatId })}
        />
      ) : (
      <ul className={styles.leaderboardStrip} aria-label="Leaderboard">
        {board.rows.map((row, i) => {
          const isSelf = row.user_id === userId;
          return (
            <li
              key={row.player_id}
              // Marks the jump when the viewer is pinned in from
              // below, so #4 and #9 don't read as adjacent.
              className={
                board.selfPinned && i === board.rows.length - 1
                  ? styles.pinnedRow
                  : undefined
              }
            >
              <LeaderboardRow
                entry={{
                  userId: ownerIdOf(row),
                  username: row.username,
                  name: row.display_name,
                  avatarUrl: row.avatar_url,
                  rank: row.rank,
                  // One field either way — `points_tenths` equals
                  // base × 10 with no handicap, and the formatter
                  // drops a pointless decimal.
                  points: formatHandicapPoints(row.points_tenths),
                  flashes: row.flashes,
                }}
                isGuest={row.is_guest}
                // They parked their seat but keep what they earned —
                // migration 102. The word is the only thing that
                // changes; the rank and points are real.
                note={row.has_left ? "Left" : undefined}
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
                      aria-label={countOf(row.zones, "zone")}
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
      )}
      {!isChork && board.hiddenCount > 0 && (
        <button
          type="button"
          className={styles.expandBoard}
          onClick={() => setBoardExpanded(true)}
        >
          {`Show all ${countOf(leaderboard.length, "player")}`}
        </button>
      )}
      {!isChork && boardExpanded && leaderboard.length > BOARD_PREVIEW_SIZE && (
        <button
          type="button"
          className={styles.expandBoard}
          onClick={() => setBoardExpanded(false)}
        >
          Show less
        </button>
      )}

      <MatchGrid
        routes={state.routes}
        myLogs={myLogByRouteId}
        grades={initialState.grades}
        match={initialState.match}
        onTileTap={(route) => openPanel({ kind: "log", routeId: route.id })}
        onAddTap={() => openPanel({ kind: "add" })}
        onTileLongPress={(route) => openPanel({ kind: "edit", routeId: route.id })}
      />

      {activeRoute && (
        <MatchLogSheet
          route={activeRoute}
          log={sheetLog}
          grades={initialState.grades}
          match={initialState.match}
          handicap={initialState.match.handicap}
          // The seat being logged for — the guest when the host is
          // entering, otherwise the viewer's own.
          ceiling={loggingPlayer?.ceiling ?? null}
          loggingFor={
            loggingPlayer && loggingPlayer.is_guest
              ? loggingPlayer.display_name
              : null
          }
          chork={
            isChork
              ? {
                  // Only trust the fetched value when it belongs to
                  // THIS round and seat — otherwise a fast switch
                  // between routes would show the previous one's
                  // allowance for a frame.
                  allowance:
                    chorkAllowance?.key
                      === `${activeRoute.id}:${loggingPlayer?.is_guest ? loggingPlayer.player_id : "me"}`
                      ? chorkAllowance.value
                      : null,
                  onConcede: () =>
                    handleConcede(
                      activeRoute.id,
                      loggingPlayer?.is_guest ? loggingPlayer.player_id : undefined,
                    ),
                  // The seat's own challenge, not yet sent: the only
                  // way to end that turn. Matched on the SEAT, so it
                  // works for a guest the host is acting for — the
                  // account behind a guest's route is null, and
                  // comparing that to the viewer never matches.
                  //
                  // Once it HAS been sent the round is live for
                  // everyone else and taking it back would erase
                  // letters they've earned, so the server refuses and
                  // the sheet stops offering it.
                  onWithdraw:
                    loggingPlayer &&
                    activeRoute.added_by_player === loggingPlayer.player_id &&
                    !sheetLog?.completed
                      ? () =>
                          handleWithdraw(
                            activeRoute.id,
                            loggingPlayer.is_guest ? loggingPlayer.player_id : null,
                          )
                      : undefined,
                }
              : undefined
          }
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
          isChork={isChork}
          grades={initialState.grades}
          match={initialState.match}
          onClose={closePanel}
          // In Chork the route belongs to whoever holds the pen. When
          // that's a guest the host is tapping for them, so the seat
          // has to travel with it — recorded under the host's own
          // account, the pen bounced straight back and the guest never
          // got a turn (migration 116).
          onSubmit={(payload) =>
            handleAddRoute({
              ...payload,
              playerId:
                isChork && penPlayer?.is_guest ? penPlayer.player_id : null,
            })
          }
          pending={isPending}
        />
      )}

      {editRoute && (
        <MatchAddRouteSheet
          mode="edit"
          route={editRoute}
          grades={initialState.grades}
          match={initialState.match}
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
          onInviteFriends={() => openPanel({ kind: "invite-friends" })}
          onClose={closePanel}
          onEnd={handleEnd}
          onLeave={handleLeave}
          pending={isPending}
        />
      )}

      {ceilingPlayer && (
        <CeilingSheet
          player={ceilingPlayer}
          grades={initialState.grades}
          match={initialState.match}
          onClose={closePanel}
          onSubmit={(ceiling, altCeiling) =>
            handleSetCeiling(ceilingPlayer.player_id, ceiling, altCeiling)
          }
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

      {panel.kind === "invite-friends" && <InviteFriendsSheet onClose={closePanel} />}

      {peekedPlayer && (
        <MatchPlayerGridSheet
          player={peekedPlayer}
          row={leaderboard.find((r) => r.player_id === peekedPlayer.player_id)}
          // The host enters a guest's sends, so from their grid the
          // host can open the log sheet on any route. Everyone else
          // (and the host on an account-backed player) gets a
          // read-only peek.
          // Offered only when the handicap is on and this viewer may
          // set this player's limit: their own seat, or a guest's if
          // they host. A row that can't do anything is worse than no
          // row.
          onSetCeiling={
            initialState.match.handicap
            && (peekedPlayer.user_id === userId
              || (isHost && peekedPlayer.is_guest))
              ? () =>
                  openPanel({
                    kind: "ceiling",
                    playerId: peekedPlayer.player_id,
                  })
              : undefined
          }
          ceilingLabel={labelForCeiling(peekedPlayer.ceiling)}
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
          match={initialState.match}
          onClose={closePanel}
        />
      )}

      {/* Chork is one setter at a time — that IS the game. Two routes
          put up at once become two rounds, and everyone owes letters
          on both. A points Match has no turn to take, so the button
          stays open there. */}
      {canSet && (
        <button
          type="button"
          className={styles.floatingAdd}
          onClick={() => openPanel({ kind: "add" })}
          aria-label={isChork ? "Set the next challenge" : "Add route"}
        >
          <FaPlus aria-hidden />
        </button>
      )}
    </main>
  );
}
