-- public.get_my_leagues, as it stands.
-- Generated from supabase/migrations/133_league.sql by `pnpm db:definitions`.
-- Do not edit: change a function with a migration, then regenerate.

create or replace function public.get_my_leagues()
returns table (
  id uuid,
  name text,
  host_id uuid,
  is_host boolean,
  ended_at timestamptz,
  week_count integer,
  last_week_at timestamptz,
  my_rank smallint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
begin
  if caller_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  return query
  select
    l.id,
    l.name,
    l.host_id,
    (l.host_id = caller_id) as is_host,
    l.ended_at,
    (select count(*)::integer from public.sets s
      where s.league_id = l.id and s.status = 'archived') as week_count,
    (select max(s.ends_at) from public.sets s
      where s.league_id = l.id and s.status = 'archived') as last_week_at,
    (select st.rank from public.league_standings(l.id) st
      where st.user_id = caller_id) as my_rank
  from public.leagues l
  where public.league_visible_to(l.id, caller_id)
  order by coalesce(
    (select max(s.ends_at) from public.sets s where s.league_id = l.id),
    l.created_at
  ) desc;
end;
$$;
