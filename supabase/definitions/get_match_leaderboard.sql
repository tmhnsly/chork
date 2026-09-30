-- public.get_match_leaderboard, as it stands.
-- Generated from supabase/migrations/102_leaving_parks_the_seat.sql by `pnpm db:definitions`.
-- Do not edit: change a function with a migration, then regenerate.

create or replace function public.get_match_leaderboard(
  p_set_id uuid,
  p_viewer_id uuid default null
)
returns table (
  player_id uuid,
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  is_guest boolean,
  sends smallint,
  flashes smallint,
  zones smallint,
  points smallint,
  points_tenths integer,
  attempts smallint,
  last_send_at timestamptz,
  rank smallint,
  has_left boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_viewer uuid;
begin
  v_viewer := case
    when (select auth.uid()) is not null then (select auth.uid())
    else p_viewer_id
  end;

  if v_viewer is null then
    return;
  end if;

  -- No `left_at is null` on the viewer either. You were in this
  -- Match; you may read how it went. Writing is gated separately, by
  -- is_active_set_player.
  if not exists (
    select 1 from public.set_players sp
    where sp.set_id = p_set_id
      and sp.user_id = v_viewer
  ) then
    return;
  end if;

  return query
  select
    st.player_id,
    st.user_id,
    p.username,
    coalesce(p.name, sp.display_name) as display_name,
    p.avatar_url,
    (sp.user_id is null) as is_guest,
    st.sends,
    st.flashes,
    st.zones,
    st.points,
    st.points_tenths,
    -- Privacy: own attempts pass through, everyone else's read 0.
    -- Unchanged by any of the above — leaving does not expose you.
    case when st.user_id = v_viewer then st.attempts else 0::smallint end as attempts,
    st.last_send_at,
    st.rank,
    st.has_left
  from public.match_standings(p_set_id) st
  join public.set_players sp on sp.id = st.player_id
  left join public.profiles p on p.id = st.user_id;
end;
$$;
