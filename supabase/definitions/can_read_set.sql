-- public.can_read_set, as it stands.
-- Generated from supabase/migrations/080_set_convergence_schema.sql by `pnpm db:definitions`.
-- Do not edit: change a function with a migration, then regenerate.

create or replace function public.can_read_set(p_set_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.sets s
    where s.id = p_set_id
      and (
        (s.owner_kind = 'gym' and public.is_gym_member(s.gym_id))
        or
        (s.owner_kind = 'climber' and public.is_set_player(s.id))
      )
  );
$$;
