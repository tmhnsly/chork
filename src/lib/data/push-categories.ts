/**
 * THE home of the push-category concept. A category is a per-climber
 * opt-out lane for pushes: its identity is a key, the `profiles`
 * bool column that stores the preference (migration 032), and the
 * label the settings sheet shows.
 *
 * This table existed as twelve spellings across nine files — a
 * union in `push/server.ts`, two category→column maps, three copies
 * inside `settingsReducer`, a hand-typed label list in
 * `SettingsSheet` (which still said "crew" two renames later), and
 * raw column lists in two `select` strings — with only three of the
 * twelve compiler-checked. Everything now derives from here; the two
 * literal `select` strings that remain (supabase-js needs literals
 * to type rows) are pinned by `push-categories.test.ts` instead.
 *
 * Adding a category = one entry here + one migration adding its
 * column. Client-safe on purpose (no server-only imports) so the
 * settings UI, the kind table and the server push filter all read
 * the same table.
 */

export const PUSH_CATEGORIES = {
  // "Tell me when someone asks" — friend requests and match invites
  // share the lane on purpose: the preference is about being asked,
  // whatever the thing being asked is.
  invite_received: {
    column: "push_invite_received",
    label: "Friend requests & match invites",
  },
  invite_accepted: {
    column: "push_invite_accepted",
    label: "Requests accepted",
  },
  // Nothing has sent this since crews died (migration 108). The
  // column keeps its value; a null label keeps the toggle out of the
  // settings sheet until something sends it again.
  ownership_changed: {
    column: "push_ownership_changed",
    label: null,
  },
} as const satisfies Record<
  string,
  { column: `push_${string}`; label: string | null }
>;

export type PushCategory = keyof typeof PUSH_CATEGORIES;
export type PushCategoryColumn =
  (typeof PUSH_CATEGORIES)[PushCategory]["column"];

export const PUSH_CATEGORY_LIST = Object.keys(
  PUSH_CATEGORIES,
) as PushCategory[];

export const PUSH_CATEGORY_COLUMNS = PUSH_CATEGORY_LIST.map(
  (c) => PUSH_CATEGORIES[c].column,
);

/** The settings sheet's rows — categories something actually sends. */
export const VISIBLE_PUSH_CATEGORIES = PUSH_CATEGORY_LIST.flatMap((c) => {
  const label = PUSH_CATEGORIES[c].label;
  return label === null ? [] : [{ category: c, label }];
});

export function columnOf(category: PushCategory): PushCategoryColumn {
  return PUSH_CATEGORIES[category].column;
}

/** The profile columns the preference lives on — structural subset
 *  so settings state needs no full Profile fixture. */
export type PushPrefsSlice = Record<PushCategoryColumn, boolean>;

/** Column-shaped profile slice → category-keyed flags. */
export function notifFlagsFromPrefs(
  p: PushPrefsSlice,
): Record<PushCategory, boolean> {
  return Object.fromEntries(
    PUSH_CATEGORY_LIST.map((c) => [c, p[PUSH_CATEGORIES[c].column]]),
  ) as Record<PushCategory, boolean>;
}

/**
 * Signature of a profile's push prefs — the settings reducer's
 * reseed key. Order is the table's key order, so the signature is
 * stable across the app for the same values.
 */
export function pushPrefsSignature(p: PushPrefsSlice): string {
  return PUSH_CATEGORY_LIST.map((c) => p[PUSH_CATEGORIES[c].column]).join("|");
}

/** Migration 032's defaults: every lane on until opted out. */
export function defaultNotifFlags(): Record<PushCategory, boolean> {
  return Object.fromEntries(
    PUSH_CATEGORY_LIST.map((c) => [c, true]),
  ) as Record<PushCategory, boolean>;
}
