-- public.get_user_saved_scales, as it stands.
-- Generated from supabase/migrations/042_jam_summaries_and_end.sql by `pnpm db:definitions`.
-- Do not edit: change a function with a migration, then regenerate.

create or replace function public.get_user_saved_scales()
returns table (
  id uuid,
  name text,
  grades jsonb,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    s.id,
    s.name,
    coalesce((
      select jsonb_agg(
        jsonb_build_object('ordinal', g.ordinal, 'label', g.label)
        order by g.ordinal
      )
      from public.user_custom_scale_grades g
      where g.scale_id = s.id
    ), '[]'::jsonb) as grades,
    s.created_at
  from public.user_custom_scales s
  where s.user_id = (select auth.uid())
  order by s.created_at desc;
$$;
