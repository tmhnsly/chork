-- public.sync_comment_likes, as it stands.
-- Generated from supabase/migrations/068_comment_likes_integrity.sql by `pnpm db:definitions`.
-- Do not edit: change a function with a migration, then regenerate.

create or replace function public.sync_comment_likes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.comments set likes = likes + 1 where id = new.comment_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.comments set likes = greatest(likes - 1, 0) where id = old.comment_id;
    return old;
  end if;
  return null;
end;
$$;
