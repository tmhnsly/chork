-- public.get_flash_leaderboard_set, as it stands.
-- Generated from supabase/migrations/018_admin_dashboard_rpcs.sql by `pnpm db:definitions`.
-- Do not edit: change a function with a migration, then regenerate.

create or replace function public.get_flash_leaderboard_set(p_set_id uuid, p_limit int default 5)
returns table (
  user_id      uuid,
  username     text,
  avatar_url   text,
  flash_count  int
)
language sql stable security definer
set search_path = ''
as $$
  with gate as (
    select 1
      from public.sets s
     where s.id = p_set_id
       and public.is_gym_admin(s.gym_id)
  )
  select
    p.id         as user_id,
    p.username,
    p.avatar_url,
    uss.flashes  as flash_count
  from public.user_set_stats uss
  join public.profiles p on p.id = uss.user_id
  where uss.set_id = p_set_id
    and uss.flashes > 0
    and exists (select 1 from gate)
  order by uss.flashes desc, p.username asc
  limit least(coalesce(p_limit, 5), 50);
$$;
