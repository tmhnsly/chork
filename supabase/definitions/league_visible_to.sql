-- public.league_visible_to, as it stands.
-- Generated from supabase/migrations/133_league.sql by `pnpm db:definitions`.
-- Do not edit: change a function with a migration, then regenerate.

create or replace function public.league_visible_to(p_league_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.leagues l where l.id = p_league_id and l.host_id = p_user_id
  ) or exists (
    select 1
    from public.sets s
    join public.set_players sp on sp.set_id = s.id
    where s.league_id = p_league_id and sp.user_id = p_user_id
  )
$$;
