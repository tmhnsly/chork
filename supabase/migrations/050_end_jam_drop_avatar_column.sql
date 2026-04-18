-- Fix: migration 047's `end_jam` rewrite inserted an `avatar_url`
-- column into `jam_summary_players`, but the table (defined in
-- migration 042) doesn't have that column. Every call to
-- `end_jam_as_player` raised:
--   column "avatar_url" of relation "jam_summary_players" does not exist
-- — which meant ending a jam was impossible in production.
--
-- The schema intentionally DOES NOT snapshot avatar_url: `username`
-- and `display_name` are denormalised at end-time, but avatars are
-- pulled live from `profiles` via `get_jam_summary`'s LEFT JOIN. If
-- the user later deletes their account, the avatar goes with them —
-- which is the correct privacy posture.
--
-- This migration re-declares `end_jam` without the `avatar_url`
-- column in the summary insert. Body is otherwise identical to
-- migration 047.

create or replace function public.end_jam(p_jam_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  jam_row public.jams;
  summary_id uuid;
  duration_s integer;
  player_count_val integer;
  winner_id uuid;
  top_routes jsonb;
  grades_snapshot jsonb;
begin
  -- Lock the jam row for the duration of the transaction so no
  -- mutation (add_jam_route / upsert_jam_log / leave_jam) can slip
  -- in between the aggregations below.
  select * into jam_row
  from public.jams
  where id = p_jam_id
  for update;

  if jam_row.id is null then
    raise exception 'Jam not found' using errcode = 'P0002';
  end if;

  if jam_row.status = 'ended' then
    raise exception 'Jam already ended' using errcode = 'P0001';
  end if;

  -- Lock every jam_players row for this jam with FOR SHARE so a
  -- concurrent leave_jam can't change the player set between the
  -- `player_count_val` read and the `jam_summary_players` insert
  -- below.
  perform 1
  from public.jam_players
  where jam_id = p_jam_id
  for share;

  duration_s := greatest(
    extract(epoch from (now() - jam_row.started_at))::integer,
    1
  );

  select count(*) into player_count_val
  from public.jam_players
  where jam_id = p_jam_id
    and left_at is null;
  if player_count_val = 0 then
    player_count_val := 1;
  end if;

  select coalesce(jsonb_agg(route_row order by total_attempts desc nulls last), '[]'::jsonb)
    into top_routes
  from (
    select
      r.number,
      r.grade,
      r.has_zone,
      coalesce(sum(l.attempts), 0)::integer as total_attempts,
      coalesce(sum(case when l.completed then 1 else 0 end), 0)::integer as sends
    from public.jam_routes r
    left join public.jam_logs l on l.jam_route_id = r.id
    where r.jam_id = p_jam_id
    group by r.id, r.number, r.grade, r.has_zone
    order by total_attempts desc nulls last
    limit 5
  ) route_row;

  if jam_row.grading_scale = 'custom' then
    select coalesce(jsonb_agg(
      jsonb_build_object('ordinal', ordinal, 'label', label)
      order by ordinal
    ), '[]'::jsonb) into grades_snapshot
    from public.jam_grades
    where jam_id = p_jam_id;
  else
    grades_snapshot := null;
  end if;

  select user_id into winner_id
  from (
    select
      jp.user_id,
      coalesce(sum(
        case
          when l.completed and l.attempts = 1 then 4
          when l.completed and l.attempts = 2 then 3
          when l.completed and l.attempts = 3 then 2
          when l.completed and l.attempts >= 4 then 1
          else 0
        end
      ), 0)
      + coalesce(sum(case when l.zone then 1 else 0 end), 0) as points,
      coalesce(sum(case when l.completed and l.attempts = 1 then 1 else 0 end), 0) as flashes,
      coalesce(sum(case when l.completed then 1 else 0 end), 0) as sends,
      max(l.completed_at) as last_send_at
    from public.jam_players jp
    left join public.jam_logs l on l.user_id = jp.user_id and l.jam_id = jp.jam_id
    where jp.jam_id = p_jam_id
      and jp.left_at is null
    group by jp.user_id
    order by points desc, flashes desc, sends desc, last_send_at asc nulls last
    limit 1
  ) w;

  insert into public.jam_summaries (
    jam_id, name, location, host_id, grading_scale,
    started_at, ended_at, duration_seconds,
    player_count, winner_user_id, payload
  ) values (
    jam_row.id,
    jam_row.name,
    jam_row.location,
    jam_row.host_id,
    jam_row.grading_scale,
    jam_row.started_at,
    now(),
    duration_s,
    player_count_val,
    winner_id,
    jsonb_build_object(
      'grading_scale', jam_row.grading_scale,
      'min_grade', jam_row.min_grade,
      'max_grade', jam_row.max_grade,
      'grades', grades_snapshot,
      'top_routes', top_routes
    )
  )
  returning id into summary_id;

  -- Per-player summary rows — no `avatar_url` column. Avatars come
  -- from the live `profiles` join in `get_jam_summary`.
  insert into public.jam_summary_players (
    jam_summary_id, user_id, username, display_name,
    rank, sends, flashes, zones, points, attempts, is_winner
  )
  select
    summary_id,
    agg.user_id,
    coalesce(p.username, 'deleted'),
    coalesce(p.name, coalesce(p.username, 'deleted')),
    row_number() over (
      order by agg.points desc, agg.flashes desc, agg.sends desc,
               agg.last_send_at asc nulls last
    )::smallint,
    agg.sends,
    agg.flashes,
    agg.zones,
    agg.points,
    agg.attempts,
    agg.user_id = winner_id
  from (
    select
      jp.user_id,
      coalesce(sum(
        case
          when l.completed and l.attempts = 1 then 4
          when l.completed and l.attempts = 2 then 3
          when l.completed and l.attempts = 3 then 2
          when l.completed and l.attempts >= 4 then 1
          else 0
        end
      ), 0)::integer as points,
      coalesce(sum(case when l.completed and l.attempts = 1 then 1 else 0 end), 0)::integer as flashes,
      coalesce(sum(case when l.completed then 1 else 0 end), 0)::integer as sends,
      coalesce(sum(case when l.zone then 1 else 0 end), 0)::integer as zones,
      coalesce(sum(l.attempts), 0)::integer as attempts,
      max(l.completed_at) as last_send_at
    from public.jam_players jp
    left join public.jam_logs l on l.user_id = jp.user_id and l.jam_id = jp.jam_id
    where jp.jam_id = p_jam_id
      and jp.left_at is null
    group by jp.user_id
  ) agg
  left join public.profiles p on p.id = agg.user_id;

  -- Collapse — drop live jam rows. The summary + summary_players
  -- rows we just wrote are the permanent store.
  delete from public.jam_logs where jam_id = p_jam_id;
  delete from public.jam_routes where jam_id = p_jam_id;
  delete from public.jam_grades where jam_id = p_jam_id;
  delete from public.jam_players where jam_id = p_jam_id;
  delete from public.jams where id = p_jam_id;

  return summary_id;
end;
$$;

revoke execute on function public.end_jam(uuid) from authenticated, anon, public;
grant execute on function public.end_jam(uuid) to service_role;
