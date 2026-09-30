-- public.chork_standings, as it stands.
-- Generated from supabase/migrations/121_two_limits_on_a_mixed_day.sql by `pnpm db:definitions`.
-- Do not edit: change a function with a migration, then regenerate.

CREATE OR REPLACE FUNCTION public.chork_standings(p_set_id uuid)
 RETURNS TABLE(player_id uuid, user_id uuid, username text, display_name text, avatar_url text, is_guest boolean, letters smallint, is_out boolean, has_left boolean, has_pen boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with rounds as (
    -- A round is a route whose SETTER sent it and has not taken it
    -- back. The setter's own send is matched on their seat, so a
    -- guest's counts exactly like an account's.
    select
      r.id as route_id,
      r.added_by_player as setter_seat,
      coalesce(r.declared_grade, r.community_grade) as grade,
      r.discipline as discipline,
      sl.attempts as setter_attempts
    from public.routes r
    join public.set_players ssp on ssp.id = r.added_by_player
    join public.route_logs sl
      on sl.route_id = r.id
     and sl.completed
     and (
       (ssp.user_id is not null and sl.user_id = ssp.user_id)
       or
       (ssp.user_id is null and sl.player_id = ssp.id)
     )
    where r.set_id = p_set_id
      and r.added_by_player is not null
      and r.withdrawn_at is null
  ),
  answers as (
    select
      sp.id as seat_id,
      public.chork_is_letter(
        coalesce(pl.attempts, 0),
        coalesce(pl.completed, false),
        -- The ceiling is stated in the Match's own scale, so it says
        -- nothing about a route from the other family (migration 118).
        -- Unknown buys no bonus, exactly as an ungraded route does.
        public.chork_allowance(
          rd.setter_attempts,
          rd.grade,
          case
            when public.discipline_family(
                   coalesce(rd.discipline, m.discipline))
               = public.discipline_family(m.discipline)
            then sp.ceiling
            else sp.alt_ceiling
          end
        )
      ) as took_letter
    from public.set_players sp
    cross join rounds rd
    cross join (select discipline from public.sets where id = p_set_id) m
    left join public.route_logs pl
      on pl.route_id = rd.route_id
     and (
       (sp.user_id is not null and pl.user_id = sp.user_id)
       or
       (sp.user_id is null and pl.player_id = sp.id)
     )
    where sp.set_id = p_set_id
      -- You don't answer your own challenge.
      and sp.id <> rd.setter_seat
  ),
  tally as (
    select
      sp.id as seat_id,
      least(coalesce(sum(case when a.took_letter then 1 else 0 end), 0), 5)::smallint
        as letters
    from public.set_players sp
    left join answers a on a.seat_id = sp.id
    where sp.set_id = p_set_id
    group by sp.id
  ),
  -- The newest challenge PUT UP — sent or not, withdrawn or not. All
  -- three states decide the pen, so none can be filtered out here.
  last_set as (
    select r.added_by_player as setter_seat,
           (r.withdrawn_at is not null) as was_withdrawn
    from public.routes r
    where r.set_id = p_set_id and r.added_by_player is not null
    order by r.number desc
    limit 1
  ),
  eligible as (
    select sp.id, sp.joined_at,
           row_number() over (order by sp.joined_at) as seat_no
    from public.set_players sp
    join tally t on t.seat_id = sp.id
    where sp.set_id = p_set_id
      and sp.left_at is null
      and t.letters < 5
  ),
  pen as (
    select case
      -- Nothing set yet: the first seat opens.
      when not exists (select 1 from last_set)
        then (select id from eligible order by seat_no limit 1)
      -- Still theirs — sent, or still working on it — as long as
      -- they're in.
      when not (select was_withdrawn from last_set)
        and exists (
          select 1 from eligible e
          where e.id = (select setter_seat from last_set)
        )
        then (select setter_seat from last_set)
      -- Withdrawn, or they went out holding it: the next eligible
      -- seat after them, wrapping.
      else coalesce(
        (select e.id from eligible e
          where e.joined_at > (
            select sp.joined_at from public.set_players sp
            where sp.id = (select setter_seat from last_set)
          )
          order by e.joined_at limit 1),
        (select id from eligible order by seat_no limit 1)
      )
    end as seat_id
  )
  select
    sp.id,
    sp.user_id,
    p.username,
    coalesce(p.name, sp.display_name),
    p.avatar_url,
    (sp.user_id is null),
    t.letters,
    (t.letters >= 5),
    (sp.left_at is not null),
    (sp.id = (select seat_id from pen))
  from public.set_players sp
  join tally t on t.seat_id = sp.id
  left join public.profiles p on p.id = sp.user_id
  where sp.set_id = p_set_id
  order by (t.letters >= 5), t.letters, sp.joined_at;
$function$
;
