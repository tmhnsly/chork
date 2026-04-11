/**
 * Badge/achievement system.
 * Badges are defined as pure serialisable data — no React components or
 * functions, so they can cross the server→client boundary safely.
 * Icon rendering is handled by the BadgeShelf client component.
 */

// ── Types ─────────────────────────────────────────

export type BadgeTier = "bronze" | "silver" | "gold";

/** Icon IDs — mapped to actual components in the BadgeShelf client component */
export type BadgeIcon = "bolt" | "fire" | "mountain" | "trophy" | "star" | "broom";

export interface BadgeDefinition {
  id: string;
  name: string;
  description: string;
  icon: BadgeIcon;
  tier: BadgeTier;
  progressKey: "flashes" | "sends" | "points" | null;
  target: number | null;
}

export interface EarnedBadge {
  badge: BadgeDefinition;
  earned: true;
}

export interface LockedBadge {
  badge: BadgeDefinition;
  earned: false;
  progress: number | null;
  current: number | null;
}

export type BadgeStatus = EarnedBadge | LockedBadge;

// ── Badge catalogue ───────────────────────────────

export const BADGES: BadgeDefinition[] = [
  {
    id: "first-flash",
    name: "First Flash",
    description: "Flash your first route",
    icon: "bolt",
    tier: "bronze",
    progressKey: "flashes",
    target: 1,
  },
  {
    id: "flash-mob",
    name: "Flash Mob",
    description: "Flash 10 routes",
    icon: "fire",
    tier: "silver",
    progressKey: "flashes",
    target: 10,
  },
  {
    id: "first-send",
    name: "First Send",
    description: "Complete your first route",
    icon: "mountain",
    tier: "bronze",
    progressKey: "sends",
    target: 1,
  },
  {
    id: "century",
    name: "Century",
    description: "Earn 100 points",
    icon: "trophy",
    tier: "gold",
    progressKey: "points",
    target: 100,
  },
  {
    id: "buckle-my-shoe",
    name: "1, 2 — Buckle My Shoe",
    description: "Send routes 1 and 2 in the same set",
    icon: "star",
    tier: "bronze",
    progressKey: null,
    target: null,
  },
  {
    id: "set-cleaner",
    name: "Set Cleaner",
    description: "Send every route in a set",
    icon: "broom",
    tier: "gold",
    progressKey: null,
    target: null,
  },
];

// ── Evaluation context ────────────────────────────

export interface BadgeContext {
  totalFlashes: number;
  totalSends: number;
  totalPoints: number;
  completedRoutesBySet: Map<string, Set<number>>;
  totalRoutesBySet: Map<string, number>;
}

// ── Evaluate all badges ───────────────────────────

export function evaluateBadges(ctx: BadgeContext): BadgeStatus[] {
  return BADGES.map((badge) => {
    switch (badge.id) {
      case "first-flash":
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
  return { badge, earned: false, progress: Math.min(1, current / target), current };
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

