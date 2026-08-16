/**
 * Chork — HORSE, on a wall.
 *
 * The rules live in CONTEXT.md; this is the arithmetic behind them,
 * kept pure so it can be tested without a database and mirrored in
 * SQL the way `computePoints` is. A round is:
 *
 *   the setter puts up a route and sends it → their attempts are N
 *   → everyone else has N attempts to send the same route
 *   → you are safe iff you sent it in N or fewer
 *   → otherwise you take a letter, and five letters puts you out.
 */

/** C-H-O-R-K. Five of them and you're out. */
export const CHORK_LETTERS = ["C", "H", "O", "R", "K"] as const;
export const CHORK_OUT_AT = CHORK_LETTERS.length;

/**
 * How many attempts a climber gets on this round.
 *
 * The setter's own count, plus one per grade the challenge sits above
 * the climber's declared limit. That ceiling is the same one the
 * handicap uses — Chork has no points to scale, so the allowance is
 * the only lever it has for mixed abilities.
 *
 * Returns the bare setter count when either side is unknown: an
 * ungraded route, or a climber who hasn't declared a limit. Guessing
 * would be worse than not helping.
 */
export function allowanceFor(
  setterAttempts: number,
  challengeGrade: number | null,
  ceiling: number | null,
): number {
  const base = Math.max(1, setterAttempts);
  if (challengeGrade === null || ceiling === null) return base;
  // At or below your limit buys nothing — you are expected to manage
  // what you already climb.
  return base + Math.max(0, challengeGrade - ceiling);
}

export interface RoundAttempt {
  /** Running attempt count on this route. */
  attempts: number;
  completed: boolean;
}

/**
 * Did this climber take a letter on this round?
 *
 * Note the shape: safety is "sent it WITHIN the allowance", not
 * "sent it". A climber who burns through their allowance, keeps
 * pulling, and tops out on the attempt after does not get to erase
 * the letter they already earned — which a naive `!completed` check
 * would let them do.
 *
 * `null` means the round is still open for them: attempts remain.
 */
export function roundOutcome(
  attempt: RoundAttempt | null,
  allowance: number,
): "safe" | "letter" | null {
  const attempts = attempt?.attempts ?? 0;
  const completed = attempt?.completed ?? false;

  if (completed && attempts <= allowance) return "safe";
  if (attempts >= allowance) return "letter";
  return null;
}

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

export interface RoundSummary {
  /** Route the round was played on, in the order it was set. */
  routeId: string;
  setterId: string;
  /** Null when the setter hasn't sent it — then it isn't a round yet. */
  setterAttempts: number | null;
}

/**
 * Whose pen is it?
 *
 * The setter keeps it while they keep sending their own challenges. A
 * challenge they fail to send is not a round at all — nobody takes a
 * letter from it — and the pen moves on.
 *
 * `order` is the seating order, which is the rotation. Players who
 * are out are skipped: a climber with five letters doesn't set.
 */
export function penHolder(
  rounds: RoundSummary[],
  order: string[],
  isOut: (playerId: string) => boolean,
): string | null {
  const eligible = order.filter((id) => !isOut(id));
  if (eligible.length === 0) return null;

  const last = rounds[rounds.length - 1];
  // Nothing set yet — the first seat opens.
  if (!last) return eligible[0];

  // They sent it, so they keep the pen — unless they've since gone out.
  if (last.setterAttempts !== null && !isOut(last.setterId)) {
    return last.setterId;
  }

  // Failed their own set (or went out): the pen moves to the next
  // eligible seat after them, wrapping.
  const from = order.indexOf(last.setterId);
  for (let step = 1; step <= order.length; step++) {
    const candidate = order[(from + step) % order.length];
    if (!isOut(candidate)) return candidate;
  }
  return null;
}

/** The game is over once one climber is left standing. */
export function winner(states: ChorkPlayerState[]): string | null {
  const alive = states.filter((s) => !s.isOut);
  // A one-player Chork has no winner — you can't outlast yourself.
  if (states.length < 2) return null;
  return alive.length === 1 ? alive[0].playerId : null;
}
