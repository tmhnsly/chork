-- public.get_earned_achievements, as it stands.
-- Generated from supabase/migrations/132_achievements_keep_their_clock_times.sql by `pnpm db:definitions`.
-- Do not edit: change a function with a migration, then regenerate.

create or replace function public.get_earned_achievements(p_user_id uuid)
returns table (
  badge_id text,
  earned_on date
)
language sql
stable
security definer
set search_path = ''
as $$
  select ua.badge_id, ua.earned_at::date
  from public.user_achievements ua
  where ua.user_id = p_user_id
    and (select auth.uid()) is not null;
$$;
