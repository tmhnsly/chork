"use client";

import { UserAvatar, Username } from "@/components/ui";
import { CHORK_LETTERS, playerState } from "@/lib/data/chork";
import type { MatchPlayerView } from "@/lib/data/match-types";
import { ownerIdOf } from "@/lib/data/match-types";
import styles from "./chorkBoard.module.scss";

interface Props {
  players: MatchPlayerView[];
  /** Letters per seat id, from `chork_standings`. */
  lettersBySeat: Map<string, number>;
  /** Whose turn it is to set, by seat id. */
  penSeatId: string | null;
  viewerId: string;
  /**
   * Open a climber's grid. The host reaches a guest's round this way
   * to log or concede for them, exactly as on the points board — a
   * board you can't tap would strand every guest in a Chork match.
   */
  onPress: (seatId: string) => void;
}

/**
 * The Chork board: who has spelled how much of it.
 *
 * No points here — Chork doesn't have any. Every player shows the
 * word with their earned letters lit, so the board reads at a glance
 * as "how close is everyone to being out", which is the only
 * question the game asks.
 */
export function ChorkBoard({
  players,
  lettersBySeat,
  penSeatId,
  viewerId,
  onPress,
}: Props) {
  return (
    <ul className={styles.board} aria-label="Chork standings">
      {players.map((player) => {
        const state = playerState(
          player.player_id,
          lettersBySeat.get(player.player_id) ?? 0,
        );
        const isSelf = player.user_id === viewerId;
        const hasPen = penSeatId === player.player_id;
        const name = player.display_name || player.username || "Climber";

        return (
          <li key={player.player_id}>
            <button
              type="button"
              onClick={() => onPress(ownerIdOf(player))}
              className={[
                styles.row,
                isSelf ? styles.self : "",
                state.isOut ? styles.out : "",
              ].filter(Boolean).join(" ")}
            >
            <UserAvatar
              user={{
                id: ownerIdOf(player),
                username: player.username ?? "unknown",
                name: player.display_name ?? "",
                avatar_url: player.avatar_url ?? "",
              }}
              size="row"
            />

            <span className={styles.identity}>
              <span className={styles.name}>
                {player.is_guest || !player.username ? (
                  name
                ) : (
                  <Username username={player.username} />
                )}
              </span>
              <span className={styles.status}>
                {state.isOut
                  ? "Out"
                  : hasPen
                    ? "Setting"
                    : player.is_guest
                      ? "Guest"
                      : name}
              </span>
            </span>

            {/* The word, with earned letters lit. Reading it is the
                whole board — you can see who's one away. */}
            <span
              className={styles.word}
              aria-label={
                state.letters === 0
                  ? "No letters"
                  : `${state.spelled.join("")}, ${state.letters} of ${CHORK_LETTERS.length}`
              }
            >
              {CHORK_LETTERS.map((letter, i) => (
                <span
                  key={letter}
                  className={i < state.letters ? styles.lit : styles.unlit}
                  aria-hidden
                >
                  {letter}
                </span>
              ))}
            </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
