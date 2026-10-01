"use client";

import { SCALE_LABEL, DISCIPLINE_LABEL } from "@/lib/data/grade-label";
import type { Match } from "@/lib/data/match-types";
import type { SetupSection } from "./matchScreenReducer";
import styles from "./matchSetupPills.module.scss";
import { setupLockReason } from "./matchScreenSelectors";

interface Props {
  match: Match;
  isHost: boolean;
  /** No route yet: nothing is locked (see `setupLockReason`). */
  lobby: boolean;
  onOpen: (section: SetupSection) => void;
}

/**
 * The match's setup, worn on its hero: game · climbing · grading ·
 * details (name and where). The host taps one to change it;
 * everyone else reads it. The location itself shows on the hero's
 * foot beside the player count, so the pill can just say what it
 * opens.
 * The game type, climbing and grading lock with the first route
 * (`setupLockReason`) — a tap then toasts why rather than opening a
 * sheet that would only refuse.
 */
export function MatchSetupPills({ match, isHost, lobby, onOpen }: Props) {
  const climbing = match.alt_grading_scale
    ? "Boulders and ropes"
    : DISCIPLINE_LABEL[match.discipline];
  const grading = match.alt_grading_scale
    ? `${SCALE_LABEL[match.grading_scale]} + ${SCALE_LABEL[match.alt_grading_scale]}`
    : SCALE_LABEL[match.grading_scale];
  const pills: { key: string; section: SetupSection; text: string }[] = [
    { key: "game", section: "game", text: match.game_mode === "chork" ? "Chork" : "Points" },
    { key: "climbing", section: "climbing", text: climbing },
    { key: "grading", section: "climbing", text: grading },
    { key: "details", section: "details", text: "Details" },
  ];
  return (
    <ul className={styles.row} aria-label="Game setup">
      {pills.map((p) => (
        <li key={p.key}>
          {isHost ? (
            <button
              type="button"
              className={`${styles.pill} ${setupLockReason(p.section, lobby) ? styles.pillLocked : ""}`}
              onClick={() => onOpen(p.section)}
            >
              {p.text}
            </button>
          ) : (
            <span className={styles.pill}>{p.text}</span>
          )}
        </li>
      ))}
    </ul>
  );
}
