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

export type BadgeCategory = "sends" | "flashes" | "streaks" | "social" | "secret";

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

export interface BadgeDefinition {
  id: string;
  name: string;
  description: string;
  icon: BadgeIcon;
  tier: BadgeTier;
  category: BadgeCategory;
  progressKey: "flashes" | "sends" | "points" | "streak" | "followers" | "following" | null;
  target: number | null;
  isSecret?: boolean;
}

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
}

// ── Evaluate all badges ───────────────────────────

export function evaluateBadges(ctx: BadgeContext): BadgeStatus[] {
  return BADGES.map((badge) => {
    // Progress-based badges (flashes / sends / points milestones)
    // use the generic progressBadge helper — `progressKey` selects
    // which aggregate to count against.
    if (badge.progressKey && badge.target !== null) {
      const current = progressValue(badge.progressKey, ctx);
      return progressBadge(badge, current);
    }

    // Condition-based badges — one case per ID.
    switch (badge.id) {
      case "tie-your-shoe":
        return conditionBadge(badge, anySetHasNumbers(ctx, [1, 2]));
      case "pick-up-the-floor":
        return conditionBadge(badge, anySetHasNumbers(ctx, [3, 4]));
      case "dont-play-tricks":
        return conditionBadge(badge, anySetHasNumbers(ctx, [5, 6]));
      case "clean-your-plate":
        return conditionBadge(badge, anySetHasNumbers(ctx, [7, 8]));
      case "start-over-again":
        return conditionBadge(badge, anySetHasNumbers(ctx, [9, 10]));
      case "saviour-of-the-universe":
        return conditionBadge(badge, checkSaviour(ctx));
      case "not-easy-being-green":
        return conditionBadge(badge, checkNotEasyBeingGreen(ctx));
      case "in-the-zone":
        return conditionBadge(badge, checkInTheZone(ctx));
      default:
        return { badge, earned: false, progress: null, current: null } as LockedBadge;
    }
  });
}

// ── Helpers ───────────────────────────────────────

function progressValue(
  key: NonNullable<BadgeDefinition["progressKey"]>,
  ctx: BadgeContext,
): number {
  switch (key) {
    case "flashes": return ctx.totalFlashes;
    case "sends":   return ctx.totalSends;
    case "points":  return ctx.totalPoints;
    // Placeholder keys (streak / followers / following) not wired
    // into the current context; always 0 until the context carries
    // them.
    default: return 0;
  }
}

function progressBadge(badge: BadgeDefinition, current: number): BadgeStatus {
  const target = badge.target!;
  if (current >= target) return { badge, earned: true };
  return { badge, earned: false, progress: Math.min(1, current / target), current };
}

function conditionBadge(badge: BadgeDefinition, met: boolean): BadgeStatus {
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
export function evaluateBadgesForSet(ctx: SetBadgeContext): BadgeDefinition[] {
  const has = (nums: number[]) => nums.every((n) => ctx.completed.has(n));

  const earned: BadgeDefinition[] = [];
  for (const badge of BADGES) {
    switch (badge.id) {
      case "tie-your-shoe":       if (has([1, 2])) earned.push(badge); break;
      case "pick-up-the-floor":   if (has([3, 4])) earned.push(badge); break;
      case "dont-play-tricks":    if (has([5, 6])) earned.push(badge); break;
      case "clean-your-plate":    if (has([7, 8])) earned.push(badge); break;
      case "start-over-again":    if (has([9, 10])) earned.push(badge); break;
      case "saviour-of-the-universe":
        if (ctx.totalRoutes > 0 && ctx.flashed.size >= ctx.totalRoutes) earned.push(badge);
        break;
      case "not-easy-being-green":
        if (ctx.totalRoutes > 0 && ctx.completed.size >= ctx.totalRoutes && ctx.flashed.size === 0) earned.push(badge);
        break;
      case "in-the-zone":
        if (ctx.zoneAvailable.size > 0) {
          let all = true;
          for (const n of ctx.zoneAvailable) {
            if (!ctx.zoneClaimed.has(n)) { all = false; break; }
          }
          if (all) earned.push(badge);
        }
        break;
    }
  }
  return earned;
}
