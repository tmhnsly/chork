-- public.is_active_set_player, as it stands.
-- Generated from supabase/migrations/102_leaving_parks_the_seat.sql by `pnpm db:definitions`.
-- Do not edit: change a function with a migration, then regenerate.

create or replace function public.is_active_set_player(p_set_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.set_players
    where set_id = p_set_id
      and user_id = (select auth.uid())
      and left_at is null
  );
$$;
