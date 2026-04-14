-- ─────────────────────────────────────────────────────────────────
-- Migration 028 — user theme preference
--
-- Stores the climber's chosen palette so it follows them across
-- devices instead of being a per-tab localStorage value. Default
-- "default" matches the bare `:root` styles in colors.scss so a
-- migrated user with no preference renders identically to today.
--
-- Allowed values are intentionally NOT enforced at the column level
-- — the theme list is owned by the app (`THEME_META` in
-- `src/lib/theme.tsx`) and we'd rather a future palette name not
-- require a migration to roll out. The client-side validator
-- (`isValidTheme`) clamps invalid values to default before render.
-- ─────────────────────────────────────────────────────────────────

alter table public.profiles
  add column if not exists theme text not null default 'default';
