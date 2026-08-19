-- ────────────────────────────────────────────────────────────────
-- When did this climber last move each achievement ladder?
-- ────────────────────────────────────────────────────────────────
--
-- The profile's achievement shelf is becoming a fixed set of slots
-- rather than a scroller, and Tom's rule for what fills them is
-- RECENCY of activity — recently earned, and recently contributed
-- towards — not proximity to the target. A badge nudged yesterday at
-- 3/50 belongs on the shelf ahead of one sitting untouched at 49/50
-- for a month, because the shelf is about what you have been DOING.
--
-- Progress is a count and carries no timestamp, so the "contributed
-- towards" half has to be derived: the last time the climber did the
-- thing the ladder counts. Six progress keys collapse to three dates —
-- a flash is also a send, and points move whenever a send does — so
-- this is one cheap query, three columns, all from rows the climber
-- already owns.
--
-- Match dates read `sets.ends_at` for archived matches, since a match
-- only counts once it is over. Privacy is unaffected: these are the
-- caller's OWN activity, and a date (not a time) is what the shelf
-- sorts by.

create or replace function public.get_achievement_activity(p_user_id uuid)
returns table (
  last_flash_at timestamptz,
  last_send_at timestamptz,
  last_match_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select max(rl.completed_at) from public.route_logs rl
      where rl.user_id = p_user_id and rl.completed and rl.attempts = 1),
    (select max(rl.completed_at) from public.route_logs rl
      where rl.user_id = p_user_id and rl.completed),
    (select max(s.ends_at) from public.set_players sp
      join public.sets s on s.id = sp.set_id
      where sp.user_id = p_user_id
        and s.owner_kind = 'climber'
        and s.status = 'archived');
$$;

revoke execute on function public.get_achievement_activity(uuid) from anon, public;
grant execute on function public.get_achievement_activity(uuid) to authenticated, service_role;
