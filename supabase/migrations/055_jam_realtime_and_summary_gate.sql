-- Fix three jam bugs that shared the same deploy window:
--
--   1. Live-jam routes never propagated between players. The client
--      subscribes to `postgres_changes` on `public.jam_routes` in
--      `src/hooks/use-jam-realtime.ts`, but no migration had ever
--      added the jam tables to the `supabase_realtime` publication,
--      so Postgres emitted zero events and every player was stuck
--      on the snapshot they loaded. Same for `jam_logs` (bug 2 —
--      other players' scores invisible) and `jam_players` (roster
--      changes invisible).
--
--   2. `REPLICA IDENTITY DEFAULT` ships only the primary key for
--      DELETE events, so Realtime's `filter: jam_id=eq.<id>`
--      predicate had nothing to match against — deletes (e.g.
--      undoing a log) fell through the filter even on tables that
--      WERE published. Set `FULL` so old-record payloads carry
--      `jam_id`.
--
--   3. Ending a jam consistently 404ed on the redirect to
--      `/jam/summary/<id>?fresh=1` even though the summary row was
--      written successfully. The summary page was running two anon
--      pre-flight RLS queries before hydrating, both of which rely
--      on `auth.uid()` through the user's JWT. Immediately after
--      `end_jam` commits + `router.push` fires the RSC fetch, the
--      in-flight cookie can briefly desync the JWT that Postgres
--      sees (auth.uid() → NULL) and both RLS branches collapse to
--      `user_id = NULL` which is always false → both pre-flights
--      return null → notFound(). Opening the same URL later from
--      the profile history hits a settled JWT, hence the "works
--      from profile, 404s on fresh redirect" shape.
--
--      Fix: move the participation gate OFF the anon RLS path and
--      INTO the existing service-role hydrator
--      `get_jam_summary_for_user`, which already receives the
--      caller's uid as an explicit argument (can't go NULL
--      mid-request). The page drops its pre-flight entirely and
--      treats a null return as notFound().

-- ── 1 + 2. Realtime publication + replica identity ──

alter publication supabase_realtime add table public.jam_routes;
alter publication supabase_realtime add table public.jam_logs;
alter publication supabase_realtime add table public.jam_players;

alter table public.jam_routes replica identity full;
alter table public.jam_logs replica identity full;
alter table public.jam_players replica identity full;

-- ── 3. get_jam_summary_for_user — gate inside the hydrator ──

create or replace function public.get_jam_summary_for_user(
  p_summary_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  authorised boolean;
begin
  if p_user_id is null then
    return null;
  end if;

  -- Participation gate: host of the summary, OR a row in
  -- jam_summary_players for this summary. Runs inside SECURITY
  -- DEFINER against ground-truth tables, so we don't loop back
  -- through RLS policies that mid-request can evaluate auth.uid()
  -- NULL — the page's observed 404-on-end root cause.
  select exists (
    select 1
    from public.jam_summaries s
    where s.id = p_summary_id
      and (
        s.host_id = p_user_id
        or exists (
          select 1
          from public.jam_summary_players jsp
          where jsp.jam_summary_id = s.id
            and jsp.user_id = p_user_id
        )
      )
  ) into authorised;

  if not authorised then
    return null;
  end if;

  return (
    select jsonb_build_object(
      'summary', to_jsonb(s),
      'players', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'user_id', jsp.user_id,
            'username', jsp.username,
            'display_name', jsp.display_name,
            'rank', jsp.rank,
            'sends', jsp.sends,
            'flashes', jsp.flashes,
            'zones', jsp.zones,
            'points', jsp.points,
            -- Privacy: attempt counts are private per CLAUDE.md.
            -- Return caller's own count, zero for everyone else.
            'attempts', case when jsp.user_id = p_user_id
                             then jsp.attempts else 0 end,
            'is_winner', jsp.is_winner,
            'avatar_url', p.avatar_url
          )
          order by jsp.rank
        )
        from public.jam_summary_players jsp
        left join public.profiles p on p.id = jsp.user_id
        where jsp.jam_summary_id = s.id
      ), '[]'::jsonb)
    )
    from public.jam_summaries s
    where s.id = p_summary_id
    limit 1
  );
end;
$$;

grant execute on function public.get_jam_summary_for_user(uuid, uuid)
  to service_role;
revoke execute on function public.get_jam_summary_for_user(uuid, uuid)
  from anon, authenticated, public;
