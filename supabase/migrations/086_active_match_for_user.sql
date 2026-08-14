-- ────────────────────────────────────────────────────────────────
-- "You're in a Match right now"
-- ────────────────────────────────────────────────────────────────
--
-- The converged equivalent of `get_active_jam_for_user_by_id`, which
-- powers the resume banner on /jam. Missed in 084 because it is the
-- one read that isn't part of running or reviewing a Match — it's the
-- one that tells you there IS one.
--
-- Service-role only, same as the jam version and for the same reason:
-- it takes the subject as an argument, so a client could otherwise
-- ask whether anyone else is mid-session. The page authenticates
-- first and passes its own user id.
--
-- A climber can only be in one live Match at a time in practice, but
-- nothing enforces that, so this returns the most recently joined and
-- lets the banner stay singular.

create or replace function public.get_active_match_for_user(p_user_id uuid)
returns table (
  set_id uuid,
  name text,
  location text,
  code text,
  player_count smallint,
  joined_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    s.id,
    s.name,
    s.location,
    s.code,
    (
      select count(*)::smallint
      from public.set_players sp2
      where sp2.set_id = s.id and sp2.left_at is null
    ),
    sp.joined_at
  from public.sets s
  join public.set_players sp
    on sp.set_id = s.id
   and sp.user_id = p_user_id
   and sp.left_at is null
  where s.owner_kind = 'climber'
    and s.status = 'live'
  order by sp.joined_at desc
  limit 1;
$$;

revoke execute on function public.get_active_match_for_user(uuid) from anon, authenticated, public;
grant execute on function public.get_active_match_for_user(uuid) to service_role;
