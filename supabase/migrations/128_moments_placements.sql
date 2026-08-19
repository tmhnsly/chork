-- ────────────────────────────────────────────────────────────────
-- Two more moments: placed on a set, placed in a match
-- ────────────────────────────────────────────────────────────────
--
-- The feed knew four kinds and missed the most ordinary good news a
-- climber has: "came 2nd on the set at my gym this month". It also
-- only ever reported a match WIN, when "results" is how everyone did.
--
-- Both are podium-only, the rule competitions already follow and for
-- the same reason — 47th of 51 is a fact, not a moment, and this feed
-- exists to celebrate rather than to report. A match podium further
-- requires someone to have finished BELOW you: 2nd of 2 is "played".
--
-- Set placements read archived sets only. A live board reshuffles
-- daily, so "placed 1st" off it can be false by tomorrow, and a
-- moment that un-happens is worse than one that arrives late.
--
-- `match_won` becomes `match_placed` with the rank in the detail; the
-- TS side maps a rank of 1 to the same "won" sentence it had, so the
-- feed loses nothing. Regenerated from pg_get_functiondef with the two
-- CTEs added, per migration 103.

drop function if exists public.get_friend_moments(integer, integer);

CREATE OR REPLACE FUNCTION public.get_friend_moments(p_limit integer DEFAULT 20, p_days integer DEFAULT 30)
 RETURNS TABLE(kind text, user_id uuid, username text, name text, avatar_url text, occurred_on date, detail jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  -- Podium, not just the win: "results" means how your friends did,
  -- and second in a five-way is worth telling. Not the whole table
  -- though — last place is nobody's highlight reel, and the kind
  -- exists to celebrate, not to report. Rank rides in the detail so
  -- the sentence can say which; a win still reads as a win.
  match_placed as (
    select
      'match_placed'::text as kind,
      st.user_id,
      p.ends_at as at,
      jsonb_build_object(
        'set_id', p.id,
        'match_name', p.name,
        'rank', st.rank,
        'player_count', (
          select count(*) from public.set_players sp2 where sp2.set_id = p.id
        )
      ) as detail
    from played p
    cross join lateral public.match_standings(p.id) st
    where st.rank <= 3
      -- A podium in a two-player match is just "played" — only worth
      -- saying when there was someone to beat below you.
      and (select count(*) from public.set_players sp3 where sp3.set_id = p.id) > st.rank
      and st.user_id in (select user_id from roster)
  ),

  -- ── Placed on a gym Set ─────────────────────────────────────────
  --
  -- The thing that was missing: your friend came 2nd on this month's
  -- set at their gym, and until now the feed said nothing. Podium
  -- only, the same rule as competitions and for the same reason.
  -- Archived sets only, so a live board — which reshuffles daily —
  -- cannot produce a "placed 1st" that is untrue by tomorrow.
  set_placed as (
    select
      'set_placed'::text as kind,
      lb.user_id,
      s.ends_at as at,
      jsonb_build_object(
        'set_id', s.id,
        'set_name', s.name,
        'gym_id', s.gym_id,
        'gym_name', g.name,
        'rank', lb.rank
      ) as detail
    from public.sets s
    join public.gyms g on g.id = s.gym_id, cutoff
    cross join lateral public.get_leaderboard_set(s.gym_id, s.id, 3, 0) lb
    where s.owner_kind = 'gym'
      and s.status = 'archived'
      and s.ends_at is not null
      and s.ends_at > cutoff.ts
      and lb.rank <= 3
      and lb.user_id in (select user_id from roster)
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
    union all select * from match_placed
    union all select * from set_placed
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
$function$
;

revoke execute on function public.get_friend_moments(integer, integer) from anon, public;
grant execute on function public.get_friend_moments(integer, integer) to authenticated;
