-- ────────────────────────────────────────────────────────────────
-- Moments — the only thing that shows you a friend at another gym
-- ────────────────────────────────────────────────────────────────
--
-- The friends board is set-scoped, because points only compare inside
-- one Set. Two friends at different gyms therefore share no board and,
-- until this, nothing else in the app showed one to the other.
--
-- That is also why this doesn't contradict "the growth loop is the
-- group chat, not an in-app feed": that principle governs YOUR OWN
-- results going out, which the share card already does. Seeing
-- somebody else's is a different job.
--
-- ── Derived, never stored ────────────────────────────────────────
--
-- Same rule as points and community grades. Nothing writes a moment;
-- all four kinds are computed from live rows. So there is no backfill,
-- no event table to keep in step, and a producer that forgets to emit
-- can't lose a moment forever — the worst case is a query that needs
-- fixing, not history that never happened.
--
-- ── Timestamps are DATES, deliberately ───────────────────────────
--
-- CLAUDE.md: activity timestamps are coarse so climbers can't infer
-- when their friends are physically at the gym. That rule was
-- previously enforced in the renderer (`relativeDay`), which means one
-- careless component could leak it. Here the precise value is used for
-- ORDERING and then thrown away — `occurred_on` is a date. The
-- guarantee holds no matter what the UI does with it.

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
  -- Friends only, and never yourself: you already know what you did.
  roster as (
    select case
             when f.requester_id = (select id from me) then f.addressee_id
             else f.requester_id
           end as user_id
      from public.friends f, me
     where f.status = 'active'
       and me.id in (f.requester_id, f.addressee_id)
  ),

  -- ── 1. A new personal best ──────────────────────────────────────
  --
  -- Partitioned by (discipline, grading_scale), not discipline alone.
  -- `declared_grade` is an ordinal into ITS OWN Set's scale, so a
  -- V-scale 5 and a font-scale 5 are different climbs — comparing
  -- them would invent a personal best out of a change of notation.
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
      -- `points` scales have no grades to be best at.
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
  personal_best as (
    select
      'personal_best'::text as kind,
      b.user_id,
      b.completed_at as at,
      jsonb_build_object(
        'grade', b.grade,
        'discipline', b.discipline,
        'grading_scale', b.grading_scale,
        -- Their first ever counts, but reads differently from beating
        -- one they already had.
        'first_ever', (b.prev_best is null)
      ) as detail
    from bests b, cutoff
    where (b.prev_best is null or b.grade > b.prev_best)
      and b.completed_at > cutoff.ts
  ),

  -- ── 2. Won a Match ──────────────────────────────────────────────
  --
  -- `match_standings` is called once per Match the roster played in,
  -- not once per player — and only for archived ones inside the
  -- window.
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

  -- ── 3. Earned an achievement ────────────────────────────────────
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

  -- ── 4. Placed in a gym competition ──────────────────────────────
  --
  -- Podium only. "Finished 47th" is a fact, not a moment — and the
  -- reason this kind is here at all is that it makes one gym's comp
  -- visible to climbers at another, which a podium does and a long
  -- tail doesn't. Widening it is a one-line change if that turns out
  -- to be wrong.
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
    -- The precise value ordered the rows and is then discarded. See
    -- the header: a date is all the client ever receives.
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

comment on function public.get_friend_moments(integer, integer) is
  'Friends'' recent moments, derived from live rows — nothing is '
  'stored. Returns a DATE, never a timestamp: the coarse-timestamp '
  'privacy rule is enforced here rather than in the renderer.';
