-- 008: Backend hardening — critical + high severity fixes from audit
--
-- CRITICAL:
--   1. get_user_set_stats / get_route_grade — add is_gym_member gate + grants
--   2. increment_comment_likes — bound p_delta to {-1, 1}
--   3. Leaderboard RPCs — cap p_limit at 100
--
-- HIGH:
--   4. All SECURITY DEFINER functions — set empty search_path
--   5. profiles.name — 80 char DB check constraint
--
-- LOW:
--   6. Drop dead gym_id_for_route function

-- ────────────────────────────────────────────────────────────────
-- 1. Stats RPCs — add gym-membership gate + explicit grants
-- ────────────────────────────────────────────────────────────────

create or replace function get_route_grade(p_route_id uuid)
returns table (route_id uuid, community_grade integer, vote_count integer)
language sql stable security definer
set search_path = ''
as $$
  select
    rl.route_id,
    round(avg(rl.grade_vote))::integer as community_grade,
    count(rl.grade_vote)::integer as vote_count
  from public.route_logs rl
  join public.routes r on r.id = rl.route_id
  join public.sets s on s.id = r.set_id
  where rl.route_id = p_route_id
    and rl.completed = true
    and rl.grade_vote is not null
    and public.is_gym_member(s.gym_id)
  group by rl.route_id;
$$;

grant execute on function get_route_grade(uuid) to authenticated;
revoke execute on function get_route_grade(uuid) from anon, public;

create or replace function get_user_set_stats(p_user_id uuid, p_gym_id uuid)
returns table (set_id uuid, completions integer, flashes integer, points integer)
language sql stable security definer
set search_path = ''
as $$
  select
    r.set_id,
    sum(case when rl.completed then 1 else 0 end)::integer as completions,
    sum(case when rl.completed and rl.attempts = 1 then 1 else 0 end)::integer as flashes,
    sum(
      (case
        when rl.completed and rl.attempts = 1 then 4
        when rl.completed and rl.attempts = 2 then 3
        when rl.completed and rl.attempts = 3 then 2
        when rl.completed then 1
        else 0
      end) + (case when rl.zone then 1 else 0 end)
    )::integer as points
  from public.route_logs rl
  join public.routes r on r.id = rl.route_id
  join public.sets s on s.id = r.set_id
  where rl.user_id = p_user_id
    and s.gym_id = p_gym_id
    and public.is_gym_member(p_gym_id)
  group by r.set_id;
$$;

grant execute on function get_user_set_stats(uuid, uuid) to authenticated;
revoke execute on function get_user_set_stats(uuid, uuid) from anon, public;

-- ────────────────────────────────────────────────────────────────
-- 2. increment_comment_likes — bound p_delta
-- ────────────────────────────────────────────────────────────────

create or replace function increment_comment_likes(p_comment_id uuid, p_delta integer)
returns integer
language sql volatile security definer
set search_path = ''
as $$
  update public.comments
  set likes = greatest(0, likes + p_delta)
  where id = p_comment_id
    and public.is_gym_member(gym_id)
    and p_delta = any(array[-1, 1])
  returning likes;
$$;

-- ────────────────────────────────────────────────────────────────
-- 3. Leaderboard RPCs — cap p_limit at 100 + set search_path
-- ────────────────────────────────────────────────────────────────

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
  with gym_logs as (
    select
      rl.user_id,
      (case
        when rl.completed and rl.attempts = 1 then 4
        when rl.completed and rl.attempts = 2 then 3
        when rl.completed and rl.attempts = 3 then 2
        when rl.completed then 1
        else 0
       end + case when rl.zone then 1 else 0 end)::int as log_points,
      rl.completed,
      (rl.completed and rl.attempts = 1) as is_flash,
      rl.zone
    from public.route_logs rl
    join public.routes r on r.id = rl.route_id
    join public.sets s on s.id = r.set_id
    where s.id = p_set_id
      and s.gym_id = p_gym_id
      and public.is_gym_member(p_gym_id)
  ),
  agg as (
    select
      gl.user_id,
      count(*) filter (where gl.completed)::int as sends,
      count(*) filter (where gl.is_flash)::int as flashes,
      count(*) filter (where gl.zone)::int as zones,
      sum(gl.log_points)::int as points
    from gym_logs gl
    group by gl.user_id
    having sum(gl.log_points) > 0
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
  with gym_logs as (
    select
      rl.user_id,
      (case
        when rl.completed and rl.attempts = 1 then 4
        when rl.completed and rl.attempts = 2 then 3
        when rl.completed and rl.attempts = 3 then 2
        when rl.completed then 1
        else 0
       end + case when rl.zone then 1 else 0 end)::int as log_points,
      rl.completed,
      (rl.completed and rl.attempts = 1) as is_flash,
      rl.zone
    from public.route_logs rl
    join public.routes r on r.id = rl.route_id
    join public.sets s on s.id = r.set_id
    where s.gym_id = p_gym_id
      and public.is_gym_member(p_gym_id)
  ),
  agg as (
    select
      gl.user_id,
      count(*) filter (where gl.completed)::int as sends,
      count(*) filter (where gl.is_flash)::int as flashes,
      count(*) filter (where gl.zone)::int as zones,
      sum(gl.log_points)::int as points
    from gym_logs gl
    group by gl.user_id
    having sum(gl.log_points) > 0
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

-- Neighbourhood/user row already return a bounded number of rows (≤5 / 1)
-- but add search_path for consistency
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
  with gym_logs as (
    select
      rl.user_id,
      (case
        when rl.completed and rl.attempts = 1 then 4
        when rl.completed and rl.attempts = 2 then 3
        when rl.completed and rl.attempts = 3 then 2
        when rl.completed then 1
        else 0
       end + case when rl.zone then 1 else 0 end)::int as log_points,
      rl.completed,
      (rl.completed and rl.attempts = 1) as is_flash,
      rl.zone
    from public.route_logs rl
    join public.routes r on r.id = rl.route_id
    join public.sets s on s.id = r.set_id
    where s.gym_id = p_gym_id
      and (p_set_id is null or s.id = p_set_id)
      and public.is_gym_member(p_gym_id)
  ),
  agg as (
    select
      gl.user_id,
      count(*) filter (where gl.completed)::int as sends,
      count(*) filter (where gl.is_flash)::int as flashes,
      count(*) filter (where gl.zone)::int as zones,
      sum(gl.log_points)::int as points
    from gym_logs gl
    group by gl.user_id
    having sum(gl.log_points) > 0
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
  with gym_logs as (
    select
      rl.user_id,
      (case
        when rl.completed and rl.attempts = 1 then 4
        when rl.completed and rl.attempts = 2 then 3
        when rl.completed and rl.attempts = 3 then 2
        when rl.completed then 1
        else 0
       end + case when rl.zone then 1 else 0 end)::int as log_points,
      rl.completed,
      (rl.completed and rl.attempts = 1) as is_flash,
      rl.zone
    from public.route_logs rl
    join public.routes r on r.id = rl.route_id
    join public.sets s on s.id = r.set_id
    where s.gym_id = p_gym_id
      and (p_set_id is null or s.id = p_set_id)
      and public.is_gym_member(p_gym_id)
  ),
  agg as (
    select
      gl.user_id,
      count(*) filter (where gl.completed)::int as sends,
      count(*) filter (where gl.is_flash)::int as flashes,
      count(*) filter (where gl.zone)::int as zones,
      sum(gl.log_points)::int as points
    from gym_logs gl
    group by gl.user_id
    having sum(gl.log_points) > 0
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
    coalesce(r.sends, 0) as sends,
    coalesce(r.flashes, 0) as flashes,
    coalesce(r.zones, 0) as zones,
    coalesce(r.points, 0) as points
  from public.profiles p
  left join ranked r on r.user_id = p.id
  where p.id = p_user_id
    and public.is_gym_member(p_gym_id);
$$;

-- ────────────────────────────────────────────────────────────────
-- 4. search_path hardening on remaining SECURITY DEFINER functions
-- ────────────────────────────────────────────────────────────────

create or replace function is_gym_member(p_gym_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.gym_memberships
    where user_id = auth.uid() and gym_id = p_gym_id
  );
$$;

create or replace function handle_new_user()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, username)
  values (new.id, 'user_' || substr(new.id::text, 1, 8));
  return new;
end;
$$;

create or replace function update_follow_counts()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.profiles set following_count = following_count + 1 where id = new.follower_id;
    update public.profiles set follower_count  = follower_count  + 1 where id = new.following_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.profiles set following_count = greatest(0, following_count - 1) where id = old.follower_id;
    update public.profiles set follower_count  = greatest(0, follower_count  - 1) where id = old.following_id;
    return old;
  end if;
  return null;
end;
$$;

-- ────────────────────────────────────────────────────────────────
-- 5. profiles.name length constraint (80 char max)
-- ────────────────────────────────────────────────────────────────

-- Truncate any existing long names to 80 chars before adding the constraint
update profiles set name = substr(name, 1, 80) where length(name) > 80;

alter table profiles
  add constraint profiles_name_length check (length(name) <= 80);

-- ────────────────────────────────────────────────────────────────
-- 6. Drop dead gym_id_for_route function (replaced by direct gym_id columns)
-- ────────────────────────────────────────────────────────────────

drop function if exists gym_id_for_route(uuid);
