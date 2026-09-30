-- public.remove_match_from_league, as it stands.
-- Generated from supabase/migrations/133_league.sql by `pnpm db:definitions`.
-- Do not edit: change a function with a migration, then regenerate.

create or replace function public.remove_match_from_league(p_league_id uuid, p_set_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
begin
  if caller_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  perform public.league_assert_host(p_league_id, caller_id);
  update public.sets set league_id = null
   where id = p_set_id and league_id = p_league_id;
  if not found then
    raise exception 'That match is not a week of this league.';
  end if;
  return p_league_id;
end;
$$;
