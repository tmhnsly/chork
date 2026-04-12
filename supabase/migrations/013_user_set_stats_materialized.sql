-- 013: Materialised user_set_stats + faster leaderboard RPCs
--
-- See docs/db-audit.md § C for the rationale. Before: the four
-- get_leaderboard_* RPCs each ran a full `route_logs → routes → sets`
-- CTE that aggregated every raw log in the gym on every paint. A gym
-- with ~1k members and ~500 routes would scan ~480k rows per paint.
--
-- After: one trigger-maintained row per (user_id, set_id) holds the
-- derived counts. Leaderboard RPCs read and rank that table directly
-- (for set-scoped queries) or aggregate across a single user's ≤N set
-- rows (for all-time queries). 100× fewer rows at steady state and
-- the ranking window runs over a pre-aggregated set.
--
-- Trigger fires AFTER INSERT / UPDATE / DELETE on route_logs. Only
-- columns that affect the aggregates trigger recomputation; updates
-- to `updated_at` / `grade_vote` / `completed_at` are noops for stats.

-- ─────────────────────────────────────────────────────────────────
-- Materialised stats table
-- ─────────────────────────────────────────────────────────────────

create table public.user_set_stats (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  set_id      uuid not null references public.sets(id)     on delete cascade,
  gym_id      uuid not null references public.gyms(id)     on delete cascade,
  sends       integer not null default 0 check (sends >= 0),
  flashes     integer not null default 0 check (flashes >= 0),
  zones       integer not null default 0 check (zones >= 0),
  points      integer not null default 0 check (points >= 0),
  updated_at  timestamptz not null default now(),
  primary key (user_id, set_id)
);

-- Gym-scoped leaderboard ranking and all-time aggregation always filter
-- on gym_id first — index it with set_id for the common (gym, set) path.
create index user_set_stats_gym_set_idx on public.user_set_stats (gym_id, set_id);

-- All-time ranking path: SUM per user within a gym → order by points.
create index user_set_stats_gym_user_idx on public.user_set_stats (gym_id, user_id);

-- Rank lookup for a single user
create index user_set_stats_user_idx on public.user_set_stats (user_id);

alter table public.user_set_stats enable row level security;

-- Gym members can read stats for their gyms (used indirectly via RPCs;
-- SECURITY DEFINER RPCs bypass RLS but a direct PostgREST select also
-- needs to work for future admin views).
create policy "Gym members can read user_set_stats"
  on public.user_set_stats for select
  to authenticated
  using (is_gym_member(gym_id));

-- No insert/update/delete policies — writes happen only via the trigger
-- below, which runs as SECURITY DEFINER.

-- ─────────────────────────────────────────────────────────────────
-- Trigger: recompute affected (user, set) on route_logs change
-- ─────────────────────────────────────────────────────────────────

create or replace function public.sync_user_set_stats()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_set_id  uuid;
  v_gym_id  uuid;
begin
  -- Determine affected (user, set) — always one pair per row event.
  if tg_op = 'DELETE' then
    v_user_id := old.user_id;
    select r.set_id, s.gym_id into v_set_id, v_gym_id
      from public.routes r
      join public.sets s on s.id = r.set_id
      where r.id = old.route_id;
  else
    v_user_id := new.user_id;
    select r.set_id, s.gym_id into v_set_id, v_gym_id
      from public.routes r
      join public.sets s on s.id = r.set_id
      where r.id = new.route_id;
  end if;

  -- Route might have been deleted already (ON DELETE CASCADE racing) —
  -- skip rather than raise.
  if v_set_id is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  -- Recompute the pair from scratch — cheap (O(routes-in-set)) and
  -- avoids any risk of drift from partial maintenance logic.
  insert into public.user_set_stats (user_id, set_id, gym_id, sends, flashes, zones, points, updated_at)
  select
    v_user_id,
    v_set_id,
    v_gym_id,
    coalesce(sum(case when rl.completed then 1 else 0 end), 0)::int,
    coalesce(sum(case when rl.completed and rl.attempts = 1 then 1 else 0 end), 0)::int,
    coalesce(sum(case when rl.zone then 1 else 0 end), 0)::int,
    coalesce(sum(
      (case
        when rl.completed and rl.attempts = 1 then 4
        when rl.completed and rl.attempts = 2 then 3
        when rl.completed and rl.attempts = 3 then 2
        when rl.completed then 1
        else 0
      end) + (case when rl.zone then 1 else 0 end)
    ), 0)::int,
    now()
  from public.route_logs rl
  join public.routes r on r.id = rl.route_id
  where rl.user_id = v_user_id
    and r.set_id = v_set_id
  on conflict (user_id, set_id) do update
    set sends      = excluded.sends,
        flashes    = excluded.flashes,
        zones      = excluded.zones,
        points     = excluded.points,
        updated_at = now();

  -- If the recomputed row has nothing to show (no completed logs, no
  -- zones, no points) and no attempts either, clean it up so the table
  -- doesn't accumulate empty rows for users who tapped then undid.
  delete from public.user_set_stats uss
   where uss.user_id = v_user_id
     and uss.set_id  = v_set_id
     and uss.sends = 0
     and uss.flashes = 0
     and uss.zones = 0
     and uss.points = 0
     and not exists (
       select 1 from public.route_logs rl2
       join public.routes r2 on r2.id = rl2.route_id
       where rl2.user_id = v_user_id and r2.set_id = v_set_id
     );

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

-- Only fire on columns that actually affect the aggregates. `updated_at`
-- changes on every trigger-less update (the updated_at trigger on
-- route_logs fires a separate write) — listing specific columns stops
-- this trigger from recomputing on that cascade.
create trigger route_logs_sync_stats
  after insert or update of user_id, route_id, attempts, completed, zone
     or delete
  on public.route_logs
  for each row execute function public.sync_user_set_stats();

-- ─────────────────────────────────────────────────────────────────
-- Backfill from existing route_logs
-- ─────────────────────────────────────────────────────────────────

insert into public.user_set_stats (user_id, set_id, gym_id, sends, flashes, zones, points, updated_at)
select
  rl.user_id,
  r.set_id,
  s.gym_id,
  coalesce(sum(case when rl.completed then 1 else 0 end), 0)::int,
  coalesce(sum(case when rl.completed and rl.attempts = 1 then 1 else 0 end), 0)::int,
  coalesce(sum(case when rl.zone then 1 else 0 end), 0)::int,
  coalesce(sum(
    (case
      when rl.completed and rl.attempts = 1 then 4
      when rl.completed and rl.attempts = 2 then 3
      when rl.completed and rl.attempts = 3 then 2
      when rl.completed then 1
      else 0
    end) + (case when rl.zone then 1 else 0 end)
  ), 0)::int,
  now()
from public.route_logs rl
join public.routes r on r.id = rl.route_id
join public.sets s on s.id = r.set_id
group by rl.user_id, r.set_id, s.gym_id
having coalesce(sum(case when rl.completed then 1 else 0 end), 0) > 0
    or coalesce(sum(case when rl.zone then 1 else 0 end), 0) > 0
on conflict (user_id, set_id) do update
  set sends      = excluded.sends,
      flashes    = excluded.flashes,
      zones      = excluded.zones,
      points     = excluded.points,
      updated_at = now();

-- ─────────────────────────────────────────────────────────────────
-- Rewrite leaderboard RPCs to read from user_set_stats
-- Behaviour is identical to the 008 versions (same columns, same
-- ordering rules, same p_limit cap, same is_gym_member guard and
-- cross-set cross-ownership check). Only the source of truth changes.
-- ─────────────────────────────────────────────────────────────────

create or replace function get_leaderboard_set(
  p_gym_id uuid,
  p_set_id uuid,
  p_limit int default 10,
  p_offset int default 0
)
returns table (
  user_id uuid,
  username text,
  name text,
  avatar_url text,
  rank bigint,
  sends int,
  flashes int,
  zones int,
  points int
)
language sql stable security definer
set search_path = ''
as $$
  with gated as (
    -- Cross-ownership check: p_set_id must belong to p_gym_id. If the
    -- caller passes a mismatched pair we return nothing.
    select 1
    where public.is_gym_member(p_gym_id)
      and exists (
        select 1 from public.sets s
        where s.id = p_set_id and s.gym_id = p_gym_id
      )
  ),
  ranked as (
    select
      uss.user_id,
      uss.sends,
      uss.flashes,
      uss.zones,
      uss.points,
      dense_rank() over (order by uss.points desc, uss.flashes desc, uss.sends desc) as rank
    from public.user_set_stats uss, gated
    where uss.set_id = p_set_id
      and uss.points > 0
  )
  select
    r.user_id,
    p.username,
    p.name,
    p.avatar_url,
    r.rank,
    r.sends,
    r.flashes,
    r.zones,
    r.points
  from ranked r
  join public.profiles p on p.id = r.user_id
  order by r.rank, p.username
  limit least(coalesce(p_limit, 10), 100) offset greatest(coalesce(p_offset, 0), 0);
$$;

grant execute on function get_leaderboard_set(uuid, uuid, int, int) to authenticated;
revoke execute on function get_leaderboard_set(uuid, uuid, int, int) from anon, public;

create or replace function get_leaderboard_all_time(
  p_gym_id uuid,
  p_limit int default 10,
  p_offset int default 0
)
returns table (
  user_id uuid,
  username text,
  name text,
  avatar_url text,
  rank bigint,
  sends int,
  flashes int,
  zones int,
  points int
)
language sql stable security definer
set search_path = ''
as $$
  with gated as (
    select 1 where public.is_gym_member(p_gym_id)
  ),
  agg as (
    select
      uss.user_id,
      sum(uss.sends)::int   as sends,
      sum(uss.flashes)::int as flashes,
      sum(uss.zones)::int   as zones,
      sum(uss.points)::int  as points
    from public.user_set_stats uss, gated
    where uss.gym_id = p_gym_id
    group by uss.user_id
    having sum(uss.points) > 0
  ),
  ranked as (
    select
      a.*,
      dense_rank() over (order by a.points desc, a.flashes desc, a.sends desc) as rank
    from agg a
  )
  select
    r.user_id,
    p.username,
    p.name,
    p.avatar_url,
    r.rank,
    r.sends,
    r.flashes,
    r.zones,
    r.points
  from ranked r
  join public.profiles p on p.id = r.user_id
  order by r.rank, p.username
  limit least(coalesce(p_limit, 10), 100) offset greatest(coalesce(p_offset, 0), 0);
$$;

grant execute on function get_leaderboard_all_time(uuid, int, int) to authenticated;
revoke execute on function get_leaderboard_all_time(uuid, int, int) from anon, public;

create or replace function get_leaderboard_neighbourhood(
  p_gym_id uuid,
  p_user_id uuid,
  p_set_id uuid default null
)
returns table (
  user_id uuid,
  username text,
  name text,
  avatar_url text,
  rank bigint,
  sends int,
  flashes int,
  zones int,
  points int
)
language sql stable security definer
set search_path = ''
as $$
  with gated as (
    select 1
    where public.is_gym_member(p_gym_id)
      and (
        p_set_id is null or exists (
          select 1 from public.sets s
          where s.id = p_set_id and s.gym_id = p_gym_id
        )
      )
  ),
  agg as (
    select
      uss.user_id,
      sum(uss.sends)::int   as sends,
      sum(uss.flashes)::int as flashes,
      sum(uss.zones)::int   as zones,
      sum(uss.points)::int  as points
    from public.user_set_stats uss, gated
    where uss.gym_id = p_gym_id
      and (p_set_id is null or uss.set_id = p_set_id)
    group by uss.user_id
    having sum(uss.points) > 0
  ),
  ranked as (
    select
      a.*,
      dense_rank() over (order by a.points desc, a.flashes desc, a.sends desc) as rank
    from agg a
  ),
  anchor as (
    select rank as user_rank from ranked where user_id = p_user_id
  )
  select
    r.user_id,
    p.username,
    p.name,
    p.avatar_url,
    r.rank,
    r.sends,
    r.flashes,
    r.zones,
    r.points
  from ranked r
  join public.profiles p on p.id = r.user_id
  cross join anchor
  where r.rank between anchor.user_rank - 2 and anchor.user_rank + 2
  order by r.rank, p.username;
$$;

grant execute on function get_leaderboard_neighbourhood(uuid, uuid, uuid) to authenticated;
revoke execute on function get_leaderboard_neighbourhood(uuid, uuid, uuid) from anon, public;

create or replace function get_leaderboard_user_row(
  p_gym_id uuid,
  p_user_id uuid,
  p_set_id uuid default null
)
returns table (
  user_id uuid,
  username text,
  name text,
  avatar_url text,
  rank bigint,
  sends int,
  flashes int,
  zones int,
  points int
)
language sql stable security definer
set search_path = ''
as $$
  with gated as (
    select 1
    where public.is_gym_member(p_gym_id)
      and (
        p_set_id is null or exists (
          select 1 from public.sets s
          where s.id = p_set_id and s.gym_id = p_gym_id
        )
      )
  ),
  agg as (
    select
      uss.user_id,
      sum(uss.sends)::int   as sends,
      sum(uss.flashes)::int as flashes,
      sum(uss.zones)::int   as zones,
      sum(uss.points)::int  as points
    from public.user_set_stats uss, gated
    where uss.gym_id = p_gym_id
      and (p_set_id is null or uss.set_id = p_set_id)
    group by uss.user_id
    having sum(uss.points) > 0
  ),
  ranked as (
    select
      a.*,
      dense_rank() over (order by a.points desc, a.flashes desc, a.sends desc) as rank
    from agg a
  )
  select
    p.id as user_id,
    p.username,
    p.name,
    p.avatar_url,
    r.rank,
    coalesce(r.sends, 0)   as sends,
    coalesce(r.flashes, 0) as flashes,
    coalesce(r.zones, 0)   as zones,
    coalesce(r.points, 0)  as points
  from public.profiles p
  left join ranked r on r.user_id = p.id
  where p.id = p_user_id
    and exists (select 1 from gated);
$$;

grant execute on function get_leaderboard_user_row(uuid, uuid, uuid) to authenticated;
revoke execute on function get_leaderboard_user_row(uuid, uuid, uuid) from anon, public;
