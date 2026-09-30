-- public.get_active_match_for_user, as it stands.
-- Generated from supabase/migrations/086_active_match_for_user.sql by `pnpm db:definitions`.
-- Do not edit: change a function with a migration, then regenerate.

create or replace function public.get_active_match_for_user(p_user_id uuid)
returns table (
  set_id uuid,
  name text,
  location text,
  code text,
  player_count smallint,
  joined_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    s.id,
    s.name,
    s.location,
    s.code,
    (
      select count(*)::smallint
      from public.set_players sp2
      where sp2.set_id = s.id and sp2.left_at is null
    ),
    sp.joined_at
  from public.sets s
  join public.set_players sp
    on sp.set_id = s.id
   and sp.user_id = p_user_id
   and sp.left_at is null
  where s.owner_kind = 'climber'
    and s.status = 'live'
  order by sp.joined_at desc
  limit 1;
$$;
