-- public.match_standings, as it stands.
-- Generated from supabase/migrations/121_two_limits_on_a_mixed_day.sql by `pnpm db:definitions`.
-- Do not edit: change a function with a migration, then regenerate.

CREATE OR REPLACE FUNCTION public.match_standings(p_set_id uuid)
 RETURNS TABLE(player_id uuid, user_id uuid, sends smallint, flashes smallint, zones smallint, points smallint, points_tenths integer, attempts smallint, last_send_at timestamp with time zone, rank smallint, has_left boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with cfg as (
    select handicap, discipline from public.sets where id = p_set_id
  ),
  agg as (
    select
      sp.id as seat_id,
      sp.user_id as account_id,
      (sp.left_at is not null) as departed,
      coalesce(sum(case when rl.completed then 1 else 0 end)::smallint, 0::smallint) as sends,
      coalesce(sum(case when rl.completed and rl.attempts = 1 then 1 else 0 end)::smallint, 0::smallint) as flashes,
      coalesce(sum(case when rl.zone then 1 else 0 end)::smallint, 0::smallint) as zones,
      coalesce(sum(public.compute_points(rl.attempts, rl.completed, rl.zone))::smallint, 0::smallint) as points,
      coalesce(sum(
        case when (select handicap from cfg) then
          public.handicap_points_tenths(
            rl.attempts, rl.completed, rl.zone,
            coalesce(r.declared_grade, r.community_grade),
            -- A ceiling is ONE number in ONE scale — the Match's own.
            -- On a mixed day (migration 117) an off-family route's
            -- ordinal is not comparable to it: a 6b rope and a V6
            -- boulder are both ordinal 6, so scoring the rope against
            -- a V4 ceiling reads as "two grades above your limit" on a
            -- scale the climber never gave a limit for. Unknown, so no
            -- adjustment — `handicap_points_tenths` already scores a
            -- null at full value.
            -- The ceiling for the family THIS route belongs to.
            -- 118 read an off-family route as "limit unknown" because
            -- there was only one ceiling; there are two now, so a
            -- climber on a mixed day gets credit for both limits.
            case
              when public.discipline_family(
                     coalesce(r.discipline, (select discipline from cfg)))
                 = public.discipline_family((select discipline from cfg))
              then sp.ceiling
              else sp.alt_ceiling
            end
          )
        else
          public.compute_points(rl.attempts, rl.completed, rl.zone) * 10
        end
      )::integer, 0) as points_tenths,
      coalesce(sum(rl.attempts)::smallint, 0::smallint) as attempts,
      max(rl.completed_at) as last_send_at
    from public.set_players sp
    left join public.route_logs rl
      on rl.set_id = sp.set_id
     and (
       (sp.user_id is not null and rl.user_id = sp.user_id)
       or
       (sp.user_id is null and rl.player_id = sp.id)
     )
    left join public.routes r on r.id = rl.route_id
    where sp.set_id = p_set_id
    -- No left_at filter. A parked seat keeps the points it earned;
    -- see the header. Ranking is unchanged, so a leaver who was
    -- winning is still shown winning — which is the honest result.
    group by sp.id, sp.user_id, sp.left_at
  )
  select
    a.seat_id,
    a.account_id,
    a.sends,
    a.flashes,
    a.zones,
    a.points,
    a.points_tenths,
    a.attempts,
    a.last_send_at,
    (dense_rank() over (
      order by a.points_tenths desc, a.flashes desc, a.sends desc, a.last_send_at asc nulls last
    ))::smallint,
    a.departed
  from agg a;
$function$
;
