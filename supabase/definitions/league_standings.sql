-- public.league_standings, as it stands.
-- Generated from supabase/migrations/134_league_placings.sql by `pnpm db:definitions`.
-- Do not edit: change a function with a migration, then regenerate.

create or replace function public.league_standings(p_league_id uuid)
returns table (
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  played smallint,
  points smallint,
  dropped_points smallint,
  firsts smallint,
  seconds smallint,
  thirds smallint,
  rank smallint
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
  if not public.league_visible_to(p_league_id, caller_id) then
    raise exception 'League not found.';
  end if;

  return query
  with weeks as (
    select s.id as set_id
    from public.sets s
    where s.league_id = p_league_id and s.status = 'archived'
  ),
  n as (select count(*)::integer as weeks from weeks),
  placings as (
    select w.set_id, lwp.user_id, lwp.rank
    from weeks w
    cross join lateral public.league_week_placings(w.set_id) lwp
    where lwp.user_id is not null
  ),
  scored as (
    select p.user_id, p.rank,
           public.league_placement_points(p.rank) as pts,
           row_number() over (
             partition by p.user_id
             order by public.league_placement_points(p.rank) desc, p.rank asc
           ) as best_first
    from placings p
  ),
  totals as (
    select
      s.user_id,
      count(*)::smallint as played,
      coalesce(sum(s.pts) filter (
        where s.best_first <= (select weeks from n) - public.league_drops((select weeks from n))
      ), 0)::smallint as points,
      coalesce(sum(s.pts) filter (
        where s.best_first > (select weeks from n) - public.league_drops((select weeks from n))
      ), 0)::smallint as dropped_points,
      (count(*) filter (where s.rank = 1))::smallint as firsts,
      (count(*) filter (where s.rank = 2))::smallint as seconds,
      (count(*) filter (where s.rank = 3))::smallint as thirds
    from scored s
    group by s.user_id
  )
  select
    t.user_id,
    pr.username,
    pr.name as display_name,
    pr.avatar_url,
    t.played,
    t.points,
    t.dropped_points,
    t.firsts,
    t.seconds,
    t.thirds,
    (dense_rank() over (
      order by t.points desc, t.firsts desc, t.seconds desc, t.thirds desc
    ))::smallint as rank
  from totals t
  join public.profiles pr on pr.id = t.user_id
  -- By position, not name: `rank` is also an OUT parameter of this
  -- plpgsql function and an unqualified reference would be ambiguous.
  order by 11, pr.username;
end;
$$;
