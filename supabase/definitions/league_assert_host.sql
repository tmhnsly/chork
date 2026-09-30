-- public.league_assert_host, as it stands.
-- Generated from supabase/migrations/133_league.sql by `pnpm db:definitions`.
-- Do not edit: change a function with a migration, then regenerate.

create or replace function public.league_assert_host(p_league_id uuid, p_host_id uuid)
returns public.leagues
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.leagues;
begin
  select * into l from public.leagues where id = p_league_id;
  if l.id is null or l.host_id <> p_host_id then
    raise exception 'Only the host can do that.';
  end if;
  return l;
end;
$$;
