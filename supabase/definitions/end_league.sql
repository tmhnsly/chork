-- public.end_league, as it stands.
-- Generated from supabase/migrations/133_league.sql by `pnpm db:definitions`.
-- Do not edit: change a function with a migration, then regenerate.

create or replace function public.end_league(p_league_id uuid)
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
  update public.leagues set ended_at = now() where id = p_league_id;
  return p_league_id;
end;
$$;
