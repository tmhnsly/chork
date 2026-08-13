/**
 * Avatar size scale — the single source of truth.
 *
 * Rungs are named by **role**, not by t-shirt size, and that is
 * deliberate. The scale this replaced had 32, 36 and 40 all in use
 * for the same thing — a list row — across the leaderboard, crew
 * lists, the comment thread and the admin widgets. Nothing was wrong
 * with any one of those numbers; the problem was that "which size is
 * a row?" had no answer, so each new component picked afresh.
 *
 * A role name has an answer. A row is `row`. Adding a new list means
 * reaching for `row`, not for a number, and the drift cannot restart.
 *
 * These are pixel values because `next/image` needs real numbers for
 * `width`/`height` — that is what keeps avatars out of the layout-
 * shift budget. The matching `--size-avatar-*` CSS tokens in
 * `theme/spacing.scss` mirror this map for the surfaces that have to
 * size a circle without rendering a `<UserAvatar>` (skeletons, the
 * "+N" pill on an avatar stack). `avatar-sizes.test.ts` asserts the
 * two stay in step.
 */
export const AVATAR_SIZES = {
  /** Overlapping avatar stacks and the "+N" pill that ends them. */
  stack: 32,
  /** Standard list row — leaderboard, crew, search, comments, feed. */
  row: 40,
  /** Emphasised row: the climber peek sheet header. */
  rowLg: 44,
  /** Podium 2nd and 3rd place. */
  podium: 64,
  /** Profile header and the edit-profile dialog. */
  hero: 72,
  /** Podium winner. */
  podiumWin: 88,
} as const;

export type AvatarSize = keyof typeof AVATAR_SIZES;

/** CSS custom-property name for a rung, for call sites that need the token. */
export const avatarSizeVar = (size: AvatarSize) => `var(--size-avatar-${size})`;
