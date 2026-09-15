-- ────────────────────────────────────────────────────────────────
-- The match bundle carries other players' logs, at the public grain
-- ────────────────────────────────────────────────────────────────
--
-- Found at Yonder: in a game, other players' scores and tiles were
-- blank after a reload. `get_match_state_for_user` handed the viewer
-- their own logs (and a host their guests'), and the screen only learnt
-- anyone else's from realtime events, one log at a time.
--
-- `other_logs` is everyone else's logs, with attempts collapsed here to
-- the same buckets `visibleAttempts()` uses: flash 1, any other send 2,
-- unsent 0. Raw counts stay owner-only (CONTEXT.md "Attempt privacy");
-- `attempt-privacy.test.ts` pins this expression. The object is built
-- field by field rather than `to_jsonb(rl)`, so no column added to
-- route_logs later rides along unreviewed. Scores are NOT derived from
-- these: other players' points come from the `leaderboard` key, which
-- `get_match_leaderboard` scores from the real counts.
--
-- A host already receives their guests' logs raw in `guest_logs`, so
-- those are left out of `other_logs` for them.
--
-- Same signature and return type as migration 102, so grants carry over.

create or replace function public.get_match_state_for_user(p_set_id uuid, p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
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
    'other_logs', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', rl.id,
          'set_id', rl.set_id,
          'route_id', rl.route_id,
          'user_id', rl.user_id,
          'player_id', rl.player_id,
          'attempts', case when not rl.completed then 0 when rl.attempts = 1 then 1 else 2 end,
          'completed', rl.completed,
          'completed_at', rl.completed_at,
          'zone', rl.zone,
          'created_at', rl.created_at,
          'updated_at', rl.updated_at
        )
      )
      from public.route_logs rl
      where rl.set_id = p_set_id
        and rl.user_id is distinct from p_user_id
        and not (is_host and rl.user_id is null)
    ), '[]'::jsonb),
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
$$;
