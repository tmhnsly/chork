import type { MatchGradingScale } from "@/lib/data/match-types";

/**
 * Human-readable label for a match grading scale. Shared between the
 * create form's scale picker and the join form's preview so both
 * surfaces stay in lock-step when the enum grows (points was added
 * in migration 046).
 */
export const MATCH_SCALE_LABEL: Record<MatchGradingScale, string> = {
  v: "V-scale",
  font: "Font",
  custom: "Custom",
  points: "Points only",
};
