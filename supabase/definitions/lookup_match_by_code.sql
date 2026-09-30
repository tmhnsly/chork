-- public.lookup_match_by_code, as it stands.
-- Generated from supabase/migrations/120_join_preview_both_scales.sql by `pnpm db:definitions`.
-- Do not edit: change a function with a migration, then regenerate.

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
