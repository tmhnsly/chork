-- public.add_match_to_league, as it stands.
-- Generated from supabase/migrations/133_league.sql by `pnpm db:definitions`.
-- Do not edit: change a function with a migration, then regenerate.

create or replace function public.add_match_to_league(p_league_id uuid, p_set_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  l public.leagues;
begin
  if caller_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  l := public.league_assert_host(p_league_id, caller_id);
  if l.ended_at is not null then
    raise exception 'This league has ended.';
  end if;
  perform public.league_assert_addable(p_set_id, caller_id);
  update public.sets set league_id = p_league_id where id = p_set_id;
  return p_league_id;
end;
$$;
