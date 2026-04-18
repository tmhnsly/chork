-- Fix: `get_jam_state_for_user` in migration 048 used
-- `row_to_jsonb(lb)` over a RETURNS TABLE function's row. Under
-- `search_path = ''`, Postgres couldn't resolve the overload for
-- the `record` row type and raised:
--   function row_to_jsonb(record) does not exist
-- Explicitly enumerating the columns via `jsonb_build_object`
-- sidesteps the record-type resolution entirely.

create or replace function public.get_jam_state_for_user(
  p_jam_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  jam_row public.jams;
begin
  if p_user_id is null then
    return null;
  end if;

  if not exists (
    select 1
    from public.jam_players
    where jam_id = p_jam_id
      and user_id = p_user_id
      and left_at is null
  ) then
    return null;
  end if;

  select * into jam_row from public.jams where id = p_jam_id;
  if jam_row.id is null then
    return null;
  end if;

  return jsonb_build_object(
    'jam', to_jsonb(jam_row),
    'grades', coalesce((
      select jsonb_agg(
        jsonb_build_object('ordinal', ordinal, 'label', label)
        order by ordinal
      )
      from public.jam_grades
      where jam_id = p_jam_id
    ), '[]'::jsonb),
    'routes', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.number)
      from public.jam_routes r
      where r.jam_id = p_jam_id
    ), '[]'::jsonb),
    'players', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'user_id', jp.user_id,
          'username', p.username,
          'display_name', p.name,
          'avatar_url', p.avatar_url,
          'joined_at', jp.joined_at,
          'is_host', (jp.user_id = jam_row.host_id)
        )
        order by jp.joined_at
      )
      from public.jam_players jp
      left join public.profiles p on p.id = jp.user_id
      where jp.jam_id = p_jam_id
        and jp.left_at is null
    ), '[]'::jsonb),
    'my_logs', coalesce((
      select jsonb_agg(to_jsonb(l))
      from public.jam_logs l
      where l.jam_id = p_jam_id
        and l.user_id = p_user_id
    ), '[]'::jsonb),
    'leaderboard', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'user_id', lb.user_id,
          'username', lb.username,
          'display_name', lb.display_name,
          'avatar_url', lb.avatar_url,
          'sends', lb.sends,
          'flashes', lb.flashes,
          'zones', lb.zones,
          'points', lb.points,
          'attempts', lb.attempts,
          'last_send_at', lb.last_send_at,
          'rank', lb.rank
        )
        order by lb.rank
      )
      from public.get_jam_leaderboard(p_jam_id) lb
    ), '[]'::jsonb)
  );
end;
$$;

grant execute on function public.get_jam_state_for_user(uuid, uuid) to service_role;
revoke execute on function public.get_jam_state_for_user(uuid, uuid) from anon, authenticated, public;
