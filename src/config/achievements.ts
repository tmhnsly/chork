/**
 * ═══════════════════════════════════════════════════════════════════
 *  Achievements catalogue — edit me!
 * ═══════════════════════════════════════════════════════════════════
 *
 * Single source of truth for every achievement.
 *
 * Every entry is one of two discriminated shapes:
 *
 *   kind: "progress"   generic — evaluator just counts `progressKey`
 *                      against `target`. No custom logic required.
 *   kind: "condition"  bespoke — `id` must be a `ConditionBadgeId`
 *                      and `evaluateBadges()` in `src/lib/badges.ts`
 *                      has a compile-time-checked case for it.
 *
 * Adding a progress badge:
 *   1. Append an entry with `kind: "progress"` below.
 *
 * Adding a condition badge:
 *   1. Extend `ConditionBadgeId` in `src/lib/badges.ts`.
 *   2. Add the case to both `evaluateCondition` (all-time) and
 *      `evaluateSetCondition` (per-set) if relevant.
 *   3. Append an entry with `kind: "condition"` below.
 *
 * IDs must stay stable — they key the persistence row in
 * `user_achievements`. Renaming an ID will re-show a locked
 * achievement a climber has already earned.
 *
 * ───────────────────────────────────────────────────────────────────
 */

import type { BadgeDefinition } from "@/lib/badges";

export const ACHIEVEMENTS: BadgeDefinition[] = [
  // ── Flashes (progress) ─────────────────────────────
  // Gen 1/2 electric-type Pokémon moves, roughly ordered by in-game
  // power. The 1000-flash rank gets a cosmic name because the climber
  // who earns it basically never logs out.
  {
    kind: "progress",
    id: "flash-thundershock",
    name: "Thunder Shock",
    description: "Flash your first route",
    icon: "bolt",
    tier: "bronze",
    category: "flashes",
    progressKey: "flashes",
    target: 1,
  },
  {
    kind: "progress",
    id: "flash-thunder-wave",
    name: "Thunder Wave",
    description: "Flash 5 routes",
    icon: "bolt",
    tier: "bronze",
    category: "flashes",
    progressKey: "flashes",
    target: 5,
  },
  {
    kind: "progress",
    id: "flash-spark",
    name: "Spark",
    description: "Flash 10 routes",
    icon: "bolt",
    tier: "bronze",
    category: "flashes",
    progressKey: "flashes",
    target: 10,
  },
  {
    kind: "progress",
    id: "flash-thunderpunch",
    name: "Thunder Punch",
    description: "Flash 25 routes",
    icon: "bolt",
    tier: "silver",
    category: "flashes",
    progressKey: "flashes",
    target: 25,
  },
  {
    kind: "progress",
    id: "flash-thunderbolt",
    name: "Thunder Bolt",
    description: "Flash 50 routes",
    icon: "bolt",
    tier: "silver",
    category: "flashes",
    progressKey: "flashes",
    target: 50,
  },
  {
    kind: "progress",
    id: "flash-thunder",
    name: "Thunder",
    description: "Flash 100 routes",
    icon: "bolt",
    tier: "gold",
    category: "flashes",
    progressKey: "flashes",
    target: 100,
  },
  {
    kind: "progress",
    id: "flash-zap-cannon",
    name: "Zap Cannon",
    description: "Flash 250 routes",
    icon: "bolt",
    tier: "gold",
    category: "flashes",
    progressKey: "flashes",
    target: 250,
  },
  {
    kind: "progress",
    id: "flash-thunderstorm",
    name: "Thunder Storm",
    description: "Flash 500 routes",
    icon: "bolt",
    tier: "gold",
    category: "flashes",
    progressKey: "flashes",
    target: 500,
  },
  {
    kind: "progress",
    // ID preserved from the original catalogue — renaming would
    // re-show the badge as locked for any climber who's already
    // earned it (persistence row in `user_achievements` keys by id).
    id: "flash-saviour-of-the-universe",
    name: "God of Thunder",
    description: "Flash 1000 routes",
    icon: "bolt",
    tier: "gold",
    category: "flashes",
    progressKey: "flashes",
    target: 1000,
  },

  // ── Sends (progress) ───────────────────────────────
  {
    kind: "progress",
    id: "first-ascend",
    name: "First (A)send",
    description: "Complete your first route",
    icon: "mountain",
    tier: "bronze",
    category: "sends",
    progressKey: "sends",
    target: 1,
  },
  {
    kind: "progress",
    id: "century",
    name: "Century",
    description: "Earn 100 points",
    icon: "trophy",
    tier: "gold",
    category: "sends",
    progressKey: "points",
    target: 100,
  },

  // ── Nursery-rhyme pairs (condition) ────────────────
  // Icon IDs render the number pair as text — see ICON_MAP in
  // BadgeShelf.tsx.
  {
    kind: "condition",
    id: "tie-your-shoe",
    name: "Tie Your Shoe",
    description: "Send routes 1 and 2 in the same set",
    icon: "num-1-2",
    tier: "bronze",
    category: "sends",
  },
  {
    kind: "condition",
    id: "pick-up-the-floor",
    name: "Pick Up The Floor",
    description: "Send routes 3 and 4 in the same set",
    icon: "num-3-4",
    tier: "bronze",
    category: "sends",
  },
  {
    kind: "condition",
    id: "dont-play-tricks",
    name: "Don't Play Tricks",
    description: "Send routes 5 and 6 in the same set",
    icon: "num-5-6",
    tier: "bronze",
    category: "sends",
  },
  {
    kind: "condition",
    id: "clean-your-plate",
    name: "Clean Your Plate",
    description: "Send routes 7 and 8 in the same set",
    icon: "num-7-8",
    tier: "bronze",
    category: "sends",
  },
  {
    kind: "condition",
    id: "start-over-again",
    name: "Start Over Again",
    description: "Send routes 9 and 10 in the same set",
    icon: "num-9-10",
    tier: "bronze",
    category: "sends",
  },

  // ── Set mastery (condition) ────────────────────────
  {
    kind: "condition",
    id: "saviour-of-the-universe",
    name: "Saviour of the Universe",
    description: "Flash every route in a set",
    icon: "crown",
    tier: "gold",
    category: "flashes",
  },
  {
    kind: "condition",
    id: "not-easy-being-green",
    name: "It's Not Easy Being Green",
    description: "Send every route in a set without a single flash",
    icon: "frog",
    tier: "gold",
    category: "sends",
  },
  {
    kind: "condition",
    id: "in-the-zone",
    name: "In the Zone",
    description: "Claim every zone hold in a set",
    icon: "flag",
    tier: "gold",
    category: "sends",
  },
];

/** Category order for filter pills on the Achievements sheet. */
export const ACHIEVEMENT_CATEGORIES = ["sends", "flashes"] as const;
