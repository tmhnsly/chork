-- 075: get_set_overview also reports how far through the set we are
--
-- `SetPaceWidget` compares "how much of the set's lifespan has passed"
-- against "how much climbing has happened". The second half came from
-- this RPC; the first was computed in React from `Date.now()`.
--
-- That produced a hydration mismatch on every admin load. The widget
-- captured its clock via a lazy `useState(() => Date.now())`, which
-- satisfies `react-hooks/purity` but still runs on the server *and*
-- again on the client, at whatever instant each reached it. The two
-- percentages then differed in their far decimals:
--
--   --pct: "66.9735894510582%"    (client)
--   --pct: "66.97358548280422%"   (server)
--
-- Dodging the lint rule is not the same as fixing what the rule points
-- at. A render that reads the clock isn't pure, and SSR is where that
-- bites.
--
-- Fixed the way this codebase already handles time. `days_remaining`
-- in this same function is computed from SQL `now()`, and the admin
-- invite page states the principle outright: "Postgres's now() is the
-- only authority that matters". Node's wall clock can also drift from
-- the database's, so deriving one half of a comparison from each was
-- wrong beyond the hydration symptom.
--
-- Integer for the same reason `send_completion_pct` is one — the
-- column comment there already says "integer for stable display", and
-- stable is exactly what a value feeding a CSS custom property on a
-- server-rendered element needs to be.
--
-- Return type changes, so the function is dropped rather than
-- replaced. Grants re-applied to match migration 018.
drop function if exists public.get_set_overview(uuid);

create function public.get_set_overview(p_set_id uuid)
returns table (
  total_routes           int,
  total_sends            int,
  max_possible_sends     int,   -- total_routes × active_climbers
  send_completion_pct    int,   -- 0..100, integer for stable display
  days_remaining         int,   -- null when ends_at is null / past
  active_climber_count   int,
  time_elapsed_pct       int    -- 0..100, null when the set has no dates
)
language sql stable security definer
set search_path = ''
as $$
  with s as (
    select s.id, s.gym_id, s.starts_at, s.ends_at
      from public.sets s
     where s.id = p_set_id
       and public.is_gym_admin(s.gym_id)
  ),
  route_count as (
    select count(*)::int as n from public.routes r
     where r.set_id = p_set_id
  ),
  participants as (
    select uss.user_id
      from public.user_set_stats uss
     where uss.set_id = p_set_id
  ),
  sends_sum as (
    select coalesce(sum(uss.sends), 0)::int as n
      from public.user_set_stats uss
     where uss.set_id = p_set_id
  )
  select
    (select n from route_count) as total_routes,
    (select n from sends_sum)    as total_sends,
    (select n from route_count) * (select count(*)::int from participants) as max_possible_sends,
    case
      when (select count(*) from participants) = 0 or (select n from route_count) = 0 then 0
      else least(
        100,
        round(
          100.0 * (select n from sends_sum)::numeric
          / ((select n from route_count) * (select count(*) from participants))::numeric
        )::int
      )
    end as send_completion_pct,
    case
      when (select ends_at from s) is null then null
      when (select ends_at from s) < now() then 0
      else extract(day from ((select ends_at from s) - now()))::int
    end as days_remaining,
    (select count(*)::int from participants) as active_climber_count,
    -- Clamped both ends: a set scheduled in the future reads 0 rather
    -- than negative, and one past its end reads 100 rather than
    -- overshooting the bar.
    case
      when (select starts_at from s) is null or (select ends_at from s) is null then null
      when (select ends_at from s) <= (select starts_at from s) then 100
      else greatest(0, least(100,
        round(
          100.0 * extract(epoch from (now() - (select starts_at from s)))::numeric
          / extract(epoch from ((select ends_at from s) - (select starts_at from s)))::numeric
        )::int
      ))
    end as time_elapsed_pct
  from s;
$$;

grant  execute on function public.get_set_overview(uuid) to authenticated;
revoke execute on function public.get_set_overview(uuid) from anon, public;
