import type { JamGradingScale } from "@/lib/data/jam-types";

/**
 * Human-readable label for a jam grading scale. Shared between the
 * create form's scale picker and the join form's preview so both
 * surfaces stay in lock-step when the enum grows (points was added
 * in migration 046).
 */
export const JAM_SCALE_LABEL: Record<JamGradingScale, string> = {
  v: "V-scale",
  font: "Font",
  custom: "Custom",
  points: "Points only",
};
