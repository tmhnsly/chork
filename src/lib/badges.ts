/**
 * Badge/achievement system — types and evaluation logic.
 *
 * The actual catalogue of achievements lives in
 * `src/config/achievements.ts`, which is re-exported below as
 * `BADGES` for backwards compatibility. To add or tweak a badge, go
 * there first. To change *how* a badge is earned (a new condition
 * type), add a case to `evaluateBadges` below.
 *
 * Badges are plain data — no React components or functions — so they
 * cross the server→client boundary without friction. Icon rendering
 * is centralised in `BadgeShelf`'s `ICON_MAP`.
 */

import { ACHIEVEMENTS } from "@/config/achievements";

// ── Types ─────────────────────────────────────────

export type BadgeTier = "bronze" | "silver" | "gold";

/**
 * Category groups achievements for the filter pills and drives the
 * accent colour family on the shelf. Narrowed to values actually
 * used by the catalogue — extend here only when you add real badges
 * in a new group (and update `ACHIEVEMENT_CATEGORIES` to match).
 */
export type BadgeCategory = "sends" | "flashes" | "jams";

/**
 * Aggregates the evaluator knows how to count. Add a value here only
 * after you've taught `progressValue()` how to read it from
 * `BadgeContext` — the progress path is now exhaustive.
 */
export type ProgressKey =
  | "flashes"
  | "sends"
  | "points"
  | "jams_played"
  | "jams_won"
  | "jams_hosted";

/**
 * IDs of every condition-based achievement. Typed as a string-
 * literal union so the evaluator switch gets compile-time
 * exhaustiveness — add a new condition badge and TypeScript tells
 * you exactly which switches need a new case.
 *
 * Progress-based achievement IDs stay free-form strings because
 * their handling is generic (target + progressKey).
 */
export type ConditionBadgeId =
  | "tie-your-shoe"
  | "pick-up-the-floor"
  | "dont-play-tricks"
  | "clean-your-plate"
  | "start-over-again"
  | "saviour-of-the-universe"
  | "not-easy-being-green"
  | "in-the-zone"
  | "jam-big-fish"
  | "jam-social-climber"
  | "jam-iron-crew";

/**
 * Icon IDs — mapped to actual components in BadgeShelf's ICON_MAP.
 * `num-*-*` entries render the paired numbers as text instead of a
 * glyph (see the rhyme-pair achievements).
 */
export type BadgeIcon =
  | "bolt"
  | "fire"
  | "mountain"
  | "trophy"
  | "star"
  | "broom"
  | "moon"
  | "fire-streak"
  | "users"
  | "user-plus"
  | "crown"
  | "frog"
  | "flag"
  | "num-1-2"
  | "num-3-4"
  | "num-5-6"
  | "num-7-8"
  | "num-9-10";

interface BadgeCommon {
  name: string;
  description: string;
  icon: BadgeIcon;
  tier: BadgeTier;
  category: BadgeCategory;
  /** Hidden in the shelf until earned. Orthogonal to category. */
  isSecret?: boolean;
}

/**
 * Progress badge — earned when a numeric aggregate (`progressKey`)
 * reaches `target`. Logic is fully generic.
 */
export interface ProgressBadgeDefinition extends BadgeCommon {
  kind: "progress";
  id: string;
  progressKey: ProgressKey;
  target: number;
}

/**
 * Condition badge — earned via bespoke logic keyed by `id`. The
 * evaluator switch in `evaluateBadges` must have a case for every
 * `ConditionBadgeId`; TypeScript enforces that.
 */
export interface ConditionBadgeDefinition extends BadgeCommon {
  kind: "condition";
  id: ConditionBadgeId;
}

export type BadgeDefinition = ProgressBadgeDefinition | ConditionBadgeDefinition;

export interface EarnedBadge {
  badge: BadgeDefinition;
  earned: true;
  earnedAt?: string;
}

export interface LockedBadge {
  badge: BadgeDefinition;
  earned: false;
  progress: number | null;
  current: number | null;
}

export type BadgeStatus = EarnedBadge | LockedBadge;

// ── Visual family ─────────────────────────────────

/**
 * Colour family a badge visually belongs to. Drives the earned-state
 * tint on the shelf + sheet as well as the ring colour on in-progress
 * slots, so a flash-category badge reads amber at 60% AND 100%.
 *   • "flash"   — amber (flash category)
 *   • "success" — teal (zone-themed badges, icon === "flag")
 *   • "accent"  — lime (everything else: send ladders, jams, condition badges)
 */
export type BadgeFamily = "accent" | "flash" | "success";

export function badgeFamily(badge: {
  category: BadgeCategory;
  icon: BadgeIcon;
}): BadgeFamily {
  if (badge.category === "flashes") return "flash";
  if (badge.icon === "flag") return "success";
  return "accent";
}

// ── Badge catalogue (re-export) ───────────────────

export const BADGES: BadgeDefinition[] = ACHIEVEMENTS;

// ── Evaluation context ────────────────────────────

export interface BadgeContext {
  totalFlashes: number;
  totalSends: number;
  totalPoints: number;
  /** Route numbers completed per set. */
  completedRoutesBySet: Map<string, Set<number>>;
  /** Total routes per set (denominator for "all of set" badges). */
  totalRoutesBySet: Map<string, number>;
  /** Route numbers flashed per set — drives Saviour / Not Easy Being Green. */
  flashedRoutesBySet: Map<string, Set<number>>;
  /** Route numbers with a zone available, per set. */
  zoneAvailableBySet: Map<string, Set<number>>;
  /** Route numbers where the climber claimed the zone, per set. */
  zoneClaimedBySet: Map<string, Set<number>>;
  /**
   * Jam activity aggregates. Sourced from `jam_summary_players` via
   * `get_jam_achievement_context`. All default to 0 for climbers
   * with no jam history — progress badges gracefully skip them.
   */
  jamsPlayed: number;
  jamsWon: number;
  jamsHosted: number;
  maxPlayersInWonJam: number;
  uniqueJamCoplayers: number;
  ironCrewMaxPairCount: number;
}

// ── Evaluate all badges ───────────────────────────

export function evaluateBadges(ctx: BadgeContext): BadgeStatus[] {
  return BADGES.map((badge): BadgeStatus => {
    if (badge.kind === "progress") {
      const current = progressValue(badge.progressKey, ctx);
      return progressBadge(badge, current);
    }
    // badge.kind === "condition" — switch on id, exhaustive.
    return conditionBadge(badge, evaluateCondition(badge.id, ctx));
  });
}

function evaluateCondition(id: ConditionBadgeId, ctx: BadgeContext): boolean {
  switch (id) {
    case "tie-your-shoe":            return anySetHasNumbers(ctx, [1, 2]);
    case "pick-up-the-floor":        return anySetHasNumbers(ctx, [3, 4]);
    case "dont-play-tricks":         return anySetHasNumbers(ctx, [5, 6]);
    case "clean-your-plate":         return anySetHasNumbers(ctx, [7, 8]);
    case "start-over-again":         return anySetHasNumbers(ctx, [9, 10]);
    case "saviour-of-the-universe":  return checkSaviour(ctx);
    case "not-easy-being-green":     return checkNotEasyBeingGreen(ctx);
    case "in-the-zone":              return checkInTheZone(ctx);
    case "jam-big-fish":             return ctx.maxPlayersInWonJam >= 6;
    case "jam-social-climber":       return ctx.uniqueJamCoplayers >= 20;
    case "jam-iron-crew":            return ctx.ironCrewMaxPairCount >= 10;
  }
}

// ── Helpers ───────────────────────────────────────

function progressValue(key: ProgressKey, ctx: BadgeContext): number {
  switch (key) {
    case "flashes":      return ctx.totalFlashes;
    case "sends":        return ctx.totalSends;
    case "points":       return ctx.totalPoints;
    case "jams_played":  return ctx.jamsPlayed;
    case "jams_won":     return ctx.jamsWon;
    case "jams_hosted":  return ctx.jamsHosted;
  }
}

function progressBadge(badge: ProgressBadgeDefinition, current: number): BadgeStatus {
  if (current >= badge.target) return { badge, earned: true };
  return {
    badge,
    earned: false,
    progress: Math.min(1, current / badge.target),
    current,
  };
}

function conditionBadge(badge: ConditionBadgeDefinition, met: boolean): BadgeStatus {
  if (met) return { badge, earned: true };
  return { badge, earned: false, progress: null, current: null };
}

/** True if any single set contains every listed route number as completed. */
function anySetHasNumbers(ctx: BadgeContext, numbers: number[]): boolean {
  for (const completed of ctx.completedRoutesBySet.values()) {
    if (numbers.every((n) => completed.has(n))) return true;
  }
  return false;
}

function checkSaviour(ctx: BadgeContext): boolean {
  for (const [setId, flashed] of ctx.flashedRoutesBySet) {
    const total = ctx.totalRoutesBySet.get(setId) ?? 0;
    if (total > 0 && flashed.size >= total) return true;
  }
  return false;
}

function checkNotEasyBeingGreen(ctx: BadgeContext): boolean {
  for (const [setId, completed] of ctx.completedRoutesBySet) {
    const total = ctx.totalRoutesBySet.get(setId) ?? 0;
    const flashed = ctx.flashedRoutesBySet.get(setId) ?? new Set<number>();
    if (total > 0 && completed.size >= total && flashed.size === 0) return true;
  }
  return false;
}

function checkInTheZone(ctx: BadgeContext): boolean {
  for (const [setId, zones] of ctx.zoneAvailableBySet) {
    if (zones.size === 0) continue;
    const claimed = ctx.zoneClaimedBySet.get(setId) ?? new Set<number>();
    let all = true;
    for (const n of zones) {
      if (!claimed.has(n)) { all = false; break; }
    }
    if (all) return true;
  }
  return false;
}

// ── Per-set badge evaluation ──────────────────────
// For the "what did I earn in THIS set" view on the profile page.
// Only condition-based badges make sense here — progress badges are
// all-time.

export interface SetBadgeContext {
  /** Route numbers the climber completed in this set. */
  completed: Set<number>;
  /** Route numbers the climber flashed in this set. */
  flashed: Set<number>;
  /** Route numbers that have zones available in this set. */
  zoneAvailable: Set<number>;
  /** Route numbers where the climber claimed the zone in this set. */
  zoneClaimed: Set<number>;
  /** Total routes in this set. */
  totalRoutes: number;
}

/**
 * Return the condition-based badges earned strictly within the given set.
 * Used in the set detail sheet to show "here's what you pulled off in
 * this set".
 */
export function evaluateBadgesForSet(ctx: SetBadgeContext): ConditionBadgeDefinition[] {
  const earned: ConditionBadgeDefinition[] = [];
  for (const badge of BADGES) {
    if (badge.kind !== "condition") continue;
    if (evaluateSetCondition(badge.id, ctx)) earned.push(badge);
  }
  return earned;
}

function evaluateSetCondition(id: ConditionBadgeId, ctx: SetBadgeContext): boolean {
  const has = (nums: number[]) => nums.every((n) => ctx.completed.has(n));
  switch (id) {
    case "tie-your-shoe":       return has([1, 2]);
    case "pick-up-the-floor":   return has([3, 4]);
    case "dont-play-tricks":    return has([5, 6]);
    case "clean-your-plate":    return has([7, 8]);
    case "start-over-again":    return has([9, 10]);
    case "saviour-of-the-universe":
      return ctx.totalRoutes > 0 && ctx.flashed.size >= ctx.totalRoutes;
    case "not-easy-being-green":
      return (
        ctx.totalRoutes > 0 &&
        ctx.completed.size >= ctx.totalRoutes &&
        ctx.flashed.size === 0
      );
    case "in-the-zone": {
      if (ctx.zoneAvailable.size === 0) return false;
      for (const n of ctx.zoneAvailable) {
        if (!ctx.zoneClaimed.has(n)) return false;
      }
      return true;
    }
    // Jam-specific conditions — their context comes from
    // jam_summary_players, not a single set. A per-set evaluation
    // can never earn them, so they always return false here.
    case "jam-big-fish":
    case "jam-social-climber":
    case "jam-iron-crew":
      return false;
  }
}
