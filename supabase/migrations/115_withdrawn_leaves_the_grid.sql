-- ────────────────────────────────────────────────────────────────
-- A withdrawn challenge leaves the wall
-- ────────────────────────────────────────────────────────────────
--
-- 114 added `routes.withdrawn_at` and taught the pen about it, but
-- the room still served the route: `get_match_state_for_user` selects
-- every row for the set, so a challenge its setter had taken back sat
-- on the grid, tappable, loggable, forever unanswerable.
--
-- One line. Regenerated from `pg_get_functiondef` rather than
-- hand-copied, because that is how migration 103 silently dropped an
-- entire guest branch out of a function it was only editing one line
-- of.

CREATE OR REPLACE FUNCTION public.get_match_state_for_user(p_set_id uuid, p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  set_row public.sets;
  is_host boolean;
begin
  if p_user_id is null then
    return null;
  end if;

  if not exists (
    select 1
    from public.set_players
    where set_id = p_set_id
      and user_id = p_user_id
  ) then
    return null;
  end if;

  select * into set_row from public.sets where id = p_set_id;
  if set_row.id is null or set_row.owner_kind <> 'climber' then
    return null;
  end if;

  is_host := (set_row.host_id = p_user_id);

  return jsonb_build_object(
    'match', to_jsonb(set_row),
    'grades', coalesce((
      select jsonb_agg(
        jsonb_build_object('ordinal', ordinal, 'label', label)
        order by ordinal
      )
      from public.set_grades
      where set_id = p_set_id
    ), '[]'::jsonb),
    'routes', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.number)
      from public.routes r
      where r.set_id = p_set_id
        -- A challenge its setter took back never became a round, so
        -- it is not part of the match: not on the grid, not loggable.
        -- The row survives only because the Chork pen is derived from
        -- the routes and needs the record of whose go it was.
        and r.withdrawn_at is null
    ), '[]'::jsonb),
    'players', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'player_id', sp.id,
          'user_id', sp.user_id,
          'is_guest', (sp.user_id is null),
          'username', p.username,
          'display_name', coalesce(p.name, sp.display_name),
          'avatar_url', p.avatar_url,
          'joined_at', sp.joined_at,
          'is_host', sp.is_host,
          'ceiling', sp.ceiling,
          'has_left', (sp.left_at is not null)
        )
        -- Parked seats sort last, then by join order, so the roster
        -- reads as "who is here" before "who was".
        order by (sp.left_at is not null), sp.joined_at
      )
      from public.set_players sp
      left join public.profiles p on p.id = sp.user_id
      where sp.set_id = p_set_id
    ), '[]'::jsonb),
    'my_logs', coalesce((
      select jsonb_agg(to_jsonb(rl))
      from public.route_logs rl
      where rl.set_id = p_set_id
        and rl.user_id = p_user_id
    ), '[]'::jsonb),
    'guest_logs', case when is_host then coalesce((
      select jsonb_agg(to_jsonb(rl))
      from public.route_logs rl
      join public.set_players sp on sp.id = rl.player_id
      where rl.set_id = p_set_id
        and sp.user_id is null
    ), '[]'::jsonb) else '[]'::jsonb end,
    'leaderboard', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'player_id', lb.player_id,
          'user_id', lb.user_id,
          'username', lb.username,
          'display_name', lb.display_name,
          'avatar_url', lb.avatar_url,
          'is_guest', lb.is_guest,
          'sends', lb.sends,
          'flashes', lb.flashes,
          'zones', lb.zones,
          'points', lb.points,
          'points_tenths', lb.points_tenths,
          'attempts', lb.attempts,
          'last_send_at', lb.last_send_at,
          'rank', lb.rank,
          'has_left', lb.has_left
        )
        order by lb.rank
      )
      from public.get_match_leaderboard(p_set_id, p_user_id) lb
    ), '[]'::jsonb)
  );
end;
$function$
;
