/**
 * ═══════════════════════════════════════════════════════════════════
 *  Achievements catalogue — edit me!
 * ═══════════════════════════════════════════════════════════════════
 *
 * This is the single source of truth for every achievement (badge) in
 * the app. Adding a new one is a two-step process:
 *
 *   1. Add an entry below with `id`, copy, icon, tier, etc.
 *   2. For anything beyond a simple "hit N of X" count, add a case
 *      in `evaluateBadges` (src/lib/badges.ts) that returns whether
 *      the condition is met. Progress-based achievements (target +
 *      progressKey) don't need any extra logic — they're generic.
 *
 * IDs must stay stable — they key the persistence row in
 * `user_achievements`, so renaming an ID will re-show a locked
 * achievement a climber has already earned.
 *
 * Sibling data-as-config files (e.g. `src/lib/send-messages.ts` for
 * toast copy) follow the same pattern: plain arrays of typed
 * records the rest of the app consumes read-only.
 *
 * ───────────────────────────────────────────────────────────────────
 */

import type { BadgeDefinition } from "@/lib/badges";

export const ACHIEVEMENTS: BadgeDefinition[] = [
  // ── Flashes (progress-based — generic in eval) ─────
  // Gen 1/2 electric-type Pokémon moves, roughly ordered by in-game
  // power. `1000` gets a special cosmic name per the climber who
  // earns it basically never logs out.
  { id: "flash-thundershock",  name: "Thunder Shock",    description: "Flash your first route",         icon: "bolt", tier: "bronze", category: "flashes", progressKey: "flashes", target: 1 },
  { id: "flash-thunder-wave",  name: "Thunder Wave",     description: "Flash 5 routes",                 icon: "bolt", tier: "bronze", category: "flashes", progressKey: "flashes", target: 5 },
  { id: "flash-spark",         name: "Spark",            description: "Flash 10 routes",                icon: "bolt", tier: "bronze", category: "flashes", progressKey: "flashes", target: 10 },
  { id: "flash-thunderpunch",  name: "Thunder Punch",    description: "Flash 25 routes",                icon: "bolt", tier: "silver", category: "flashes", progressKey: "flashes", target: 25 },
  { id: "flash-thunderbolt",   name: "Thunder Bolt",     description: "Flash 50 routes",                icon: "bolt", tier: "silver", category: "flashes", progressKey: "flashes", target: 50 },
  { id: "flash-thunder",       name: "Thunder",          description: "Flash 100 routes",               icon: "bolt", tier: "gold",   category: "flashes", progressKey: "flashes", target: 100 },
  { id: "flash-zap-cannon",    name: "Zap Cannon",       description: "Flash 250 routes",               icon: "bolt", tier: "gold",   category: "flashes", progressKey: "flashes", target: 250 },
  { id: "flash-thunderstorm",  name: "Thunder Storm",    description: "Flash 500 routes",               icon: "bolt", tier: "gold",   category: "flashes", progressKey: "flashes", target: 500 },
  { id: "flash-god-of-thunder",name: "God of Thunder",   description: "Flash 1000 routes",              icon: "bolt", tier: "gold",   category: "flashes", progressKey: "flashes", target: 1000 },

  // ── Sends (progress + milestone) ───────────────────
  { id: "first-ascend",        name: "First (A)send",    description: "Complete your first route",      icon: "mountain", tier: "bronze", category: "sends", progressKey: "sends",  target: 1 },
  { id: "century",             name: "Century",          description: "Earn 100 points",                icon: "trophy",   tier: "gold",   category: "sends", progressKey: "points", target: 100 },

  // ── Nursery-rhyme pairs (condition-based per set) ──
  // Icon IDs render the number pair as text — see ICON_MAP in
  // BadgeShelf.tsx.
  { id: "tie-your-shoe",           name: "Tie Your Shoe",                  description: "Send routes 1 and 2 in the same set",   icon: "num-1-2",  tier: "bronze", category: "sends", progressKey: null, target: null },
  { id: "pick-up-the-floor",       name: "Pick Up The Floor",              description: "Send routes 3 and 4 in the same set",   icon: "num-3-4",  tier: "bronze", category: "sends", progressKey: null, target: null },
  { id: "dont-play-tricks",        name: "Don't Play Tricks",              description: "Send routes 5 and 6 in the same set",   icon: "num-5-6",  tier: "bronze", category: "sends", progressKey: null, target: null },
  { id: "clean-your-plate",        name: "Clean Your Plate",               description: "Send routes 7 and 8 in the same set",   icon: "num-7-8",  tier: "bronze", category: "sends", progressKey: null, target: null },
  { id: "start-over-again",        name: "Start Over Again",               description: "Send routes 9 and 10 in the same set",  icon: "num-9-10", tier: "bronze", category: "sends", progressKey: null, target: null },

  // ── Set mastery ────────────────────────────────────
  { id: "saviour-of-the-universe", name: "Saviour of the Universe",        description: "Flash every route in a set",            icon: "crown",     tier: "gold",   category: "flashes", progressKey: null, target: null },
  { id: "not-easy-being-green",    name: "It's Not Easy Being Green",      description: "Send every route in a set without a single flash", icon: "frog", tier: "gold",   category: "sends",   progressKey: null, target: null },
  { id: "in-the-zone",             name: "In the Zone",                    description: "Claim every zone hold in a set",        icon: "flag",      tier: "gold",   category: "sends",   progressKey: null, target: null },
];

/** Category order for filter pills on the Achievements sheet. */
export const ACHIEVEMENT_CATEGORIES = [
  "sends",
  "flashes",
  "streaks",
  "social",
  "secret",
] as const;
