-- ────────────────────────────────────────────────────────────────
-- The join preview tells the whole truth
-- ────────────────────────────────────────────────────────────────
--
-- `lookup_match_by_code` returned one scale, so a Match running
-- boulders AND ropes (migration 117) previewed as "V-scale" to
-- someone deciding whether to join. It under-reported rather than
-- misled — the rope routes are a surprise on arrival, not a broken
-- promise — but the preview exists precisely so nobody has to guess.
--
-- Regenerated from `pg_get_functiondef`, per migration 103. Return
-- type changes, so the old signature is dropped first — `create or
-- replace` refuses a changed OUT list (migration 113's trap).

drop function if exists public.lookup_match_by_code(text);

CREATE OR REPLACE FUNCTION public.lookup_match_by_code(p_code text)
 RETURNS TABLE(set_id uuid, name text, location text, host_username text, host_display_name text, player_count smallint, grading_scale text, alt_grading_scale text, discipline text, status text, at_cap boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    s.id as set_id,
    s.name,
    s.location,
    p.username as host_username,
    p.name as host_display_name,
    (
      select count(*)::smallint
      from public.set_players
      where set_id = s.id and left_at is null
    ) as player_count,
    s.grading_scale,
    -- A mixed day grades boulders and ropes on different ladders
    -- (migration 117). Showing only `grading_scale` told a climber
    -- deciding whether to join that this was a bouldering Match when
    -- it was also running ropes — half the truth, before they commit.
    s.alt_grading_scale,
    s.discipline,
    s.status,
    (
      select count(*)
      from public.set_players
      where set_id = s.id and left_at is null
    ) >= 20 as at_cap
  from public.sets s
  left join public.profiles p on p.id = s.host_id
  where s.code = upper(p_code)
    -- A gym Set has no code, but be explicit: this function must
    -- never become a way to read gym Sets you aren't a member of.
    and s.owner_kind = 'climber'
  limit 1;
$function$
;

-- Grants restored exactly as they were before the drop — NOT anon.
-- The code is the invitation, but you still have to be signed in to
-- spend it, and a drop silently takes the old grants with it.
revoke execute on function public.lookup_match_by_code(text) from anon, public;
grant execute on function public.lookup_match_by_code(text) to authenticated, service_role;
