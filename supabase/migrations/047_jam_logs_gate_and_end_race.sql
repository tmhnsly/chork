-- Two tightenings on the Jams schema, both surfaced by the
-- post-launch code review:
--
--   1. `jam_logs_delete` had no live-status gate, so a motivated
--      player could theoretically race `end_jam` between the
--      transactional `status` flip and the `jam_logs` delete to
--      remove their failed attempts from the final summary. The
--      whole end-jam pipeline runs in one transaction so the
--      window is ~instant, but the RLS policy should encode the
--      invariant regardless — defence in depth.
--
--   2. `end_jam` computed `player_count` from a `jam_players`
--      count CTE, then later re-queried the aggregate to insert
--      `jam_summary_players` rows. `jam_players` wasn't locked
--      between the two reads, so a concurrent `leave_jam` could
--      leave the stored `player_count` and the actual inserted
--      rows disagreeing permanently. A `FOR SHARE` lock on
--      `jam_players` scoped to the jam keeps both reads consistent.

-- ── 1. jam_logs_delete — require the jam is still live ────────

drop policy if exists jam_logs_delete on public.jam_logs;

create policy jam_logs_delete on public.jam_logs
  for delete to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.jams j
      where j.id = jam_logs.jam_id
        and j.status = 'live'
    )
  );

-- ── 2. end_jam — lock jam_players across the two aggregations ─
-- The body is unchanged except for the added FOR SHARE lock near
-- the top. Everything below it reads from a stable snapshot of
-- jam_players for this jam.

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
  -- mutation (add_jam_route / upsert_jam_log / leave_jam) can
  -- slip in between the aggregations below.
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
  -- below. Unlike FOR UPDATE this allows other readers but blocks
  -- writers.
  perform 1
  from public.jam_players
  where jam_id = p_jam_id
  for share;

  duration_s := greatest(
    extract(epoch from (now() - jam_row.started_at))::integer,
    1
  );

  -- Snapshot of participants at end time (left_at IS NULL).
  select count(*) into player_count_val
  from public.jam_players
  where jam_id = p_jam_id
    and left_at is null;
  if player_count_val = 0 then
    player_count_val := 1;
  end if;

  -- Route-level roll-up for the payload. Top 5 by attempts,
  -- nulls-last so routes with zero logs don't crowd the list.
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

  -- Winner recomputed from the locked aggregate so it matches the
  -- rows inserted below.
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

  -- Per-player summary rows — pulled from the same locked aggregate.
  insert into public.jam_summary_players (
    jam_summary_id, user_id, username, display_name, avatar_url,
    rank, sends, flashes, zones, points, attempts, is_winner
  )
  select
    summary_id,
    agg.user_id,
    coalesce(p.username, 'deleted'),
    coalesce(p.display_name, coalesce(p.username, 'deleted')),
    p.avatar_url,
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

  -- Winner id was snapshot above; now re-stamp zones aggregate on
  -- summary winner flag if the winner's points were updated. No-op
  -- if nothing changed.

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

-- end_jam was revoked from authenticated in migration 044;
-- re-apply the same grants so only service_role + the wrapper can
-- call it directly.
revoke execute on function public.end_jam(uuid) from authenticated, anon, public;
grant execute on function public.end_jam(uuid) to service_role;
