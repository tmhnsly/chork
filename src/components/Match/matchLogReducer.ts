/**
 * Draft state for the match attempt logger. `attempts` / `completed` /
 * `zone` are one value with three fields — every submit ships all
 * three together — so they live in one reducer rather than three
 * `useState`s with mirror refs (CLAUDE.md: "useReducer for genuinely
 * coupled state"). Sibling of the wall's `routeLogReducer`, scoped to
 * the match sheet's smaller surface (no comments, no grade voting).
 *
 * Pure and unit-tested: call `matchLogReducer(draft, action)` and
 * assert the return — see matchLogReducer.test.ts.
 */

export interface MatchLogDraft {
  attempts: number;
  completed: boolean;
  zone: boolean;
}

export type MatchLogDraftAction =
  | { type: "set-attempts"; attempts: number }
  | { type: "mark-complete" }
  | { type: "undo-complete" }
  | { type: "set-zone"; zone: boolean };

export function initMatchLogDraft(
  log: { attempts: number; completed: boolean; zone: boolean } | null,
): MatchLogDraft {
  return {
    attempts: log?.attempts ?? 0,
    completed: log?.completed ?? false,
    zone: log?.zone ?? false,
  };
}

export function matchLogReducer(
  draft: MatchLogDraft,
  action: MatchLogDraftAction,
): MatchLogDraft {
  switch (action.type) {
    case "set-attempts":
      // Attempts are frozen while completed. The +/- buttons are
      // disabled in that state; this is the structural guard for any
      // programmatic caller.
      if (draft.completed) return draft;
      return { ...draft, attempts: action.attempts };
    case "mark-complete":
      // Completing from zero attempts means "I sent it just now" —
      // that first go IS the attempt, so the count coerces to 1
      // (which also makes it a flash, correctly).
      return {
        ...draft,
        attempts: draft.attempts === 0 ? 1 : draft.attempts,
        completed: true,
      };
    case "undo-complete":
      // Attempts survive the undo — the tries happened either way.
      return { ...draft, completed: false };
    case "set-zone":
      return { ...draft, zone: action.zone };
    default:
      return draft;
  }
}
