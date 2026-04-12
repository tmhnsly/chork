-- 020: Remove follows / followers
--
-- The follows system never powered a real feature — we're replacing it
-- with the mutual-agreement "crew" model shipped in migration 021.
-- Tear everything down cleanly in one go so there are no orphan tables
-- or trigger bodies left gaming RLS evaluation.
--
-- Order:
--   1. Drop the trigger first (it depends on the function).
--   2. Drop the function.
--   3. Drop the counts on profiles (trigger is gone so nothing else
--      writes to them).
--   4. Drop the follows table (RLS policies cascade away with it).

drop trigger if exists follows_count_sync on public.follows;
drop function if exists public.update_follow_counts() cascade;

alter table public.profiles
  drop constraint if exists profiles_follower_count_non_negative,
  drop constraint if exists profiles_following_count_non_negative,
  drop column if exists follower_count,
  drop column if exists following_count;

drop table if exists public.follows cascade;
