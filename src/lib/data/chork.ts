/**
 * Chork — HORSE, on a wall.
 *
 * The rules live in CONTEXT.md; a round is:
 *
 *   the setter puts up a route and sends it → their attempts are N
 *   → everyone else has N attempts to send the same route
 *   → you are safe iff you sent it in N or fewer
 *   → otherwise you take a letter, and five letters puts you out.
 *
 * ── Why almost none of that arithmetic is here ────────────────────
 *
 * Unlike `computePoints`, which has a working TS home because a tile
 * only needs its own log, every Chork rule needs somebody ELSE's raw
 * attempt count: the allowance is the setter's count, a letter is
 * measured against it, and the pen turns on whether the setter sent
 * their own challenge. Raw attempts are private to their owner
 * (CONTEXT.md "Attempt privacy"), so a client can only ever compute
 * those rules from data it is not allowed to have — which is exactly
 * what a first pass did, silently rotating the pen to the wrong
 * climber for every viewer who wasn't the setter.
 *
 * So the arithmetic has one home, `chork_allowance` /
 * `chork_is_letter` / `chork_standings` (migrations 111–113), and the
 * client renders the public result. What is left here is the display
 * side: the word, and how much of it a seat has spelled.
 */

/** C-H-O-R-K. Five of them and you're out. */
export const CHORK_LETTERS = ["C", "H", "O", "R", "K"] as const;
export const CHORK_OUT_AT = CHORK_LETTERS.length;

export interface ChorkPlayerState {
  playerId: string;
  letters: number;
  /** Five letters. They keep their seat and can watch, not climb. */
  isOut: boolean;
  /** The letters spelled so far, for display: ["C", "H"]. */
  spelled: string[];
}

export function playerState(playerId: string, letters: number): ChorkPlayerState {
  const capped = Math.min(letters, CHORK_OUT_AT);
  return {
    playerId,
    letters: capped,
    isOut: capped >= CHORK_OUT_AT,
    spelled: CHORK_LETTERS.slice(0, capped),
  };
}
