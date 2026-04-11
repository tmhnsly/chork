/**
 * Badge/achievement system.
 * Badges are defined as pure data — evaluation is a pure function
 * that takes stats and returns which badges are earned + progress.
 */

import {
  FaBolt,
  FaFire,
  FaMountainSun,
  FaTrophy,
  FaStar,
  FaBroom,
} from "react-icons/fa6";
import type { IconType } from "react-icons";

// ── Types ─────────────────────────────────────────

export type BadgeTier = "bronze" | "silver" | "gold";

export interface BadgeDefinition {
  id: string;
  name: string;
  description: string;
  icon: IconType;
  tier: BadgeTier;
  /** The stat this badge tracks for progress (null = no measurable progress) */
  progressKey: "flashes" | "sends" | "points" | null;
  /** Target value for progress-based badges */
  target: number | null;
}

export interface EarnedBadge {
  badge: BadgeDefinition;
  earned: true;
}

export interface LockedBadge {
  badge: BadgeDefinition;
  earned: false;
  /** 0–1 progress toward earning (null if not measurable) */
  progress: number | null;
  /** Current count toward target */
  current: number | null;
}

export type BadgeStatus = EarnedBadge | LockedBadge;

// ── Badge catalogue ───────────────────────────────

export const BADGES: BadgeDefinition[] = [
  {
    id: "first-flash",
    name: "First Flash",
    description: "Flash your first route",
    icon: FaBolt,
    tier: "bronze",
    progressKey: "flashes",
    target: 1,
  },
  {
    id: "flash-mob",
    name: "Flash Mob",
    description: "Flash 10 routes",
    icon: FaFire,
    tier: "silver",
    progressKey: "flashes",
    target: 10,
  },
  {
    id: "first-send",
    name: "First Send",
    description: "Complete your first route",
    icon: FaMountainSun,
    tier: "bronze",
    progressKey: "sends",
    target: 1,
  },
  {
    id: "century",
    name: "Century",
    description: "Earn 100 points",
    icon: FaTrophy,
    tier: "gold",
    progressKey: "points",
    target: 100,
  },
  {
    id: "buckle-my-shoe",
    name: "1, 2 — Buckle My Shoe",
    description: "Send routes 1 and 2 in the same set",
    icon: FaStar,
    tier: "bronze",
    progressKey: null,
    target: null,
  },
  {
    id: "set-cleaner",
    name: "Set Cleaner",
    description: "Send every route in a set",
    icon: FaBroom,
    tier: "gold",
    progressKey: null,
    target: null,
  },
];

// ── Evaluation context ────────────────────────────

export interface BadgeContext {
  /** All-time totals */
  totalFlashes: number;
  totalSends: number;
  totalPoints: number;
  /** Per-set data: for each set, the set of completed route numbers */
  completedRoutesBySet: Map<string, Set<number>>;
  /** Per-set data: total routes in each set */
  totalRoutesBySet: Map<string, number>;
}

// ── Evaluate all badges ───────────────────────────

export function evaluateBadges(ctx: BadgeContext): BadgeStatus[] {
  return BADGES.map((badge) => {
    switch (badge.id) {
      case "first-flash":
        return progressBadge(badge, ctx.totalFlashes);
      case "flash-mob":
        return progressBadge(badge, ctx.totalFlashes);
      case "first-send":
        return progressBadge(badge, ctx.totalSends);
      case "century":
        return progressBadge(badge, ctx.totalPoints);
      case "buckle-my-shoe":
        return conditionBadge(badge, checkBuckleMyShoe(ctx));
      case "set-cleaner":
        return conditionBadge(badge, checkSetCleaner(ctx));
      default:
        return { badge, earned: false, progress: null, current: null } as LockedBadge;
    }
  });
}

// ── Helpers ───────────────────────────────────────

function progressBadge(badge: BadgeDefinition, current: number): BadgeStatus {
  const target = badge.target!;
  if (current >= target) return { badge, earned: true };
  return {
    badge,
    earned: false,
    progress: Math.min(1, current / target),
    current,
  };
}

function conditionBadge(badge: BadgeDefinition, met: boolean): BadgeStatus {
  if (met) return { badge, earned: true };
  return { badge, earned: false, progress: null, current: null };
}

function checkBuckleMyShoe(ctx: BadgeContext): boolean {
  for (const completed of ctx.completedRoutesBySet.values()) {
    if (completed.has(1) && completed.has(2)) return true;
  }
  return false;
}

function checkSetCleaner(ctx: BadgeContext): boolean {
  for (const [setId, completed] of ctx.completedRoutesBySet) {
    const totalRoutes = ctx.totalRoutesBySet.get(setId) ?? 0;
    if (totalRoutes > 0 && completed.size >= totalRoutes) return true;
  }
  return false;
}

// ── Tier colours (maps to design tokens) ──────────

export const TIER_COLOURS = {
  bronze: {
    solid: "var(--flash-solid)",        // amber-9
    text: "var(--flash-text-low-contrast)",
  },
  silver: {
    solid: "var(--mono-text-low-contrast)", // olive-11
    text: "var(--mono-text)",
  },
  gold: {
    solid: "var(--accent-solid)",       // lime-9
    text: "var(--accent-text)",
  },
} as const;
