-- public.league_assert_addable, as it stands.
-- Generated from supabase/migrations/133_league.sql by `pnpm db:definitions`.
-- Do not edit: change a function with a migration, then regenerate.

create or replace function public.league_assert_addable(p_set_id uuid, p_host_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.sets;
begin
  select * into s from public.sets where id = p_set_id and owner_kind = 'climber';
  if s.id is null then
    raise exception 'Match not found.';
  end if;
  if s.host_id <> p_host_id then
    raise exception 'Only the host of a match can add it to a league.';
  end if;
  if s.status <> 'archived' then
    raise exception 'End the match first — only finished matches count as a week.';
  end if;
  if s.league_id is not null then
    raise exception 'That match is already a week of a league.';
  end if;
end;
$$;
