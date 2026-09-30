-- public.is_admin_of_route, as it stands.
-- Generated from supabase/migrations/014_admin_foundation.sql by `pnpm db:definitions`.
-- Do not edit: change a function with a migration, then regenerate.

create or replace function public.is_admin_of_route(p_route_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.routes r
      join public.sets   s on s.id = r.set_id
      join public.gym_admins ga on ga.gym_id = s.gym_id
     where r.id = p_route_id
       and ga.user_id = (select auth.uid())
  );
$$;
