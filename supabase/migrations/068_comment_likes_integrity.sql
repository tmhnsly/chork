-- 068: comment_likes counter integrity (audit 2026-08-10, Direction C)
--
-- comments.likes was maintained only by the increment_comment_likes RPC,
-- fired from toggleCommentLike alongside a SEPARATE comment_likes row
-- write — so the two could diverge on partial failure, and a cascade
-- delete of a departed user's likes never decremented the counter (it
-- drifted upward forever). Move the counter onto a trigger on
-- comment_likes so the row change and the count move commit together,
-- reconcile existing counts, and drop the now-unused RPC (the app writes
-- the row directly and re-reads the trigger-maintained count). Dropping
-- the RPC also closes its like-forgery surface (it was authenticated-
-- executable — the Direction B item deferred to here).

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

drop trigger if exists comment_likes_sync on public.comment_likes;
create trigger comment_likes_sync
  after insert or delete on public.comment_likes
  for each row execute function public.sync_comment_likes();

-- Reconcile any existing drift to the true row count.
update public.comments c
   set likes = sub.cnt
  from (
    select comment_id, count(*)::int as cnt
    from public.comment_likes group by comment_id
  ) sub
 where c.id = sub.comment_id
   and c.likes <> sub.cnt;
update public.comments c
   set likes = 0
 where c.likes <> 0
   and not exists (select 1 from public.comment_likes cl where cl.comment_id = c.id);

drop function if exists public.increment_comment_likes(uuid, integer);
