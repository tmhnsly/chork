-- ────────────────────────────────────────────────────────────────
-- One personal best per day, not one per rung
-- ────────────────────────────────────────────────────────────────
--
-- Found by looking at the feed: a climber who worked up V2 → V3 → V4
-- → V5 in one session produced FOUR moments, three of which were the
-- rungs on the way to the one that mattered. The seeded data showed
-- "sent their first V4" directly above "sent their first V5", same
-- climber, same day.
--
-- Each of those rows is individually true — every one really was a
-- new best at the moment it happened. But a feed that reports the
-- working as well as the answer isn't sparse, and sparse is the only
-- thing that makes this feed worth opening. Keep the highest grade
-- per (climber, discipline, scale, day).
--
-- Per DAY rather than per session because a day is what the feed
-- already shows — timestamps are coarse by contract (migration 109),
-- so two moments the UI labels identically must not both appear.
-- There is no session concept to group by, and inventing one would
-- need the clock times this deliberately throws away.

create or replace function public.get_friend_moments(
  p_limit integer default 20,
  p_days integer default 30
)
returns table (
  kind text,
  user_id uuid,
  username text,
  name text,
  avatar_url text,
  occurred_on date,
  detail jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select (select auth.uid()) as id
  ),
  cutoff as (
    select now() - (least(greatest(coalesce(p_days, 30), 1), 365) || ' days')::interval as ts
  ),
  roster as (
    select case
             when f.requester_id = (select id from me) then f.addressee_id
             else f.requester_id
           end as user_id
      from public.friends f, me
     where f.status = 'active'
       and me.id in (f.requester_id, f.addressee_id)
  ),

  sends as (
    select
      rl.user_id,
      coalesce(r.discipline, s.discipline) as discipline,
      s.grading_scale,
      coalesce(r.declared_grade, r.community_grade) as grade,
      rl.completed_at
    from public.route_logs rl
    join public.routes r on r.id = rl.route_id
    join public.sets s on s.id = rl.set_id
    where rl.completed
      and rl.completed_at is not null
      and rl.user_id in (select user_id from roster)
      and s.grading_scale in ('v', 'font', 'yds', 'french')
  ),
  bests as (
    select
      user_id, discipline, grading_scale, grade, completed_at,
      max(grade) over (
        partition by user_id, discipline, grading_scale
        order by completed_at
        rows between unbounded preceding and 1 preceding
      ) as prev_best
    from sends
    where grade is not null
  ),
  new_bests as (
    select *
      from bests b, cutoff
     where (b.prev_best is null or b.grade > b.prev_best)
       and b.completed_at > cutoff.ts
  ),
  -- The change. `distinct on` keeps the first row of each group, and
  -- the order names which one that is: the hardest of the day, and
  -- the earliest send of that grade if they repeated it.
  personal_best as (
    select distinct on (nb.user_id, nb.discipline, nb.grading_scale, nb.completed_at::date)
      'personal_best'::text as kind,
      nb.user_id,
      nb.completed_at as at,
      jsonb_build_object(
        'grade', nb.grade,
        'discipline', nb.discipline,
        'grading_scale', nb.grading_scale,
        'first_ever', (nb.prev_best is null)
      ) as detail
    from new_bests nb
    order by
      nb.user_id, nb.discipline, nb.grading_scale, nb.completed_at::date,
      nb.grade desc, nb.completed_at asc
  ),

  played as (
    select distinct s.id, s.name, s.ends_at
      from public.sets s
      join public.set_players sp on sp.set_id = s.id, cutoff
     where s.owner_kind = 'climber'
       and s.status = 'archived'
       and s.ends_at is not null
       and s.ends_at > cutoff.ts
       and sp.user_id in (select user_id from roster)
  ),
  match_won as (
    select
      'match_won'::text as kind,
      st.user_id,
      p.ends_at as at,
      jsonb_build_object(
        'set_id', p.id,
        'match_name', p.name,
        'player_count', (
          select count(*) from public.set_players sp2 where sp2.set_id = p.id
        )
      ) as detail
    from played p
    cross join lateral public.match_standings(p.id) st
    where st.rank = 1
      and st.user_id in (select user_id from roster)
  ),

  achievement as (
    select
      'achievement'::text as kind,
      ua.user_id,
      ua.earned_at as at,
      jsonb_build_object('badge_id', ua.badge_id) as detail
    from public.user_achievements ua, cutoff
    where ua.user_id in (select user_id from roster)
      and ua.earned_at > cutoff.ts
  ),

  competition_placing as (
    select
      'competition_placing'::text as kind,
      lb.user_id,
      c.ends_at as at,
      jsonb_build_object(
        'competition_id', c.id,
        'competition_name', c.name,
        'rank', lb.rank,
        'gym_name', (
          select g.name from public.competition_gyms cg
          join public.gyms g on g.id = cg.gym_id
          where cg.competition_id = c.id
          limit 1
        )
      ) as detail
    from public.competitions c, cutoff
    cross join lateral public.get_competition_leaderboard(c.id, null, 3, 0) lb
    where c.status = 'ended'
      and c.ends_at is not null
      and c.ends_at > cutoff.ts
      and lb.user_id in (select user_id from roster)
  ),

  everything as (
    select * from personal_best
    union all select * from match_won
    union all select * from achievement
    union all select * from competition_placing
  )

  select
    e.kind,
    e.user_id,
    p.username,
    p.name,
    p.avatar_url,
    e.at::date as occurred_on,
    e.detail
  from everything e
  join public.profiles p on p.id = e.user_id
  where (select id from me) is not null
  order by e.at desc
  limit least(greatest(coalesce(p_limit, 20), 1), 100);
$$;

revoke execute on function public.get_friend_moments(integer, integer) from anon, public;
grant execute on function public.get_friend_moments(integer, integer) to authenticated;
