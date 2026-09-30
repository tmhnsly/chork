-- public.get_achievement_activity, as it stands.
-- Generated from supabase/migrations/132_achievements_keep_their_clock_times.sql by `pnpm db:definitions`.
-- Do not edit: change a function with a migration, then regenerate.

create or replace function public.get_achievement_activity()
returns table (
  last_flash_on date,
  last_send_on date,
  last_match_on date
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select max(rl.completed_at)::date from public.route_logs rl
      where rl.user_id = (select auth.uid()) and rl.completed and rl.attempts = 1),
    (select max(rl.completed_at)::date from public.route_logs rl
      where rl.user_id = (select auth.uid()) and rl.completed),
    (select max(s.ends_at)::date from public.set_players sp
      join public.sets s on s.id = sp.set_id
      where sp.user_id = (select auth.uid())
        and s.owner_kind = 'climber'
        and s.status = 'archived')
  where (select auth.uid()) is not null;
$$;
