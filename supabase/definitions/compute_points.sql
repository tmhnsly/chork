-- public.compute_points, as it stands.
-- Generated from supabase/migrations/063_compute_points_fn.sql by `pnpm db:definitions`.
-- Do not edit: change a function with a migration, then regenerate.

create or replace function public.compute_points(
  p_attempts integer,
  p_completed boolean,
  p_zone boolean
)
returns integer
language sql
immutable
parallel safe
as $$
  select (case
      when p_completed and p_attempts = 1 then 4
      when p_completed and p_attempts = 2 then 3
      when p_completed and p_attempts = 3 then 2
      when p_completed then 1
      else 0
    end)
    + (case when p_zone then 1 else 0 end);
$$;
