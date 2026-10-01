import type { ScoreRow } from "./ScoringChart";

/**
 * The scoring ladder as the chart draws it, mirroring `computePoints`
 * in src/lib/data/logs.ts. `weight` is the ratio to a flash (4 pts =
 * 1.0) so bar lengths stay honest; the zone is a +1 stipend, not a
 * competing bar, and its weight matches its point value. One copy
 * for the Chorkboard's card and the marketing page — both server
 * components, which is why it isn't in `ScoringChart.tsx`: a constant
 * exported from a "use client" module is a client reference on the
 * server (see `src/test/client-boundary.test.ts`).
 */
export const SCORING_ROWS: ScoreRow[] = [
  { label: "Flash (1st try)", points: "4 pts", weight: 1,    accent: "flash" },
  { label: "2 attempts",      points: "3 pts", weight: 0.75 },
  { label: "3 attempts",      points: "2 pts", weight: 0.5  },
  { label: "4+ attempts",     points: "1 pt",  weight: 0.25 },
  { label: "Zone hold",       points: "+1 pt", weight: 0.25, accent: "zone" },
];
