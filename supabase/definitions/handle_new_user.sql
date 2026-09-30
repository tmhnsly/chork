-- public.handle_new_user, as it stands.
-- Generated from supabase/migrations/123_signup_was_broken.sql by `pnpm db:definitions`.
-- Do not edit: change a function with a migration, then regenerate.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, username, name, avatar_url)
  values (
    new.id,
    'user_' || replace(new.id::text, '-', ''),
    -- Both columns are NOT NULL. The outer coalesce is the whole
    -- point: an email signup has no metadata, every lookup misses,
    -- and without it this inserts NULL and takes the signup with it.
    coalesce(
      nullif(trim(coalesce(
        new.raw_user_meta_data ->> 'full_name',
        new.raw_user_meta_data ->> 'name',
        ''
      )), ''),
      ''
    ),
    coalesce(
      nullif(trim(coalesce(
        new.raw_user_meta_data ->> 'avatar_url',
        new.raw_user_meta_data ->> 'picture',
        ''
      )), ''),
      ''
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
