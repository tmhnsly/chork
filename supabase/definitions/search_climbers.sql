-- public.search_climbers, as it stands.
-- Generated from supabase/migrations/127_search_climbers.sql by `pnpm db:definitions`.
-- Do not edit: change a function with a migration, then regenerate.

create or replace function public.search_climbers(
  p_query text,
  p_limit integer default 20
)
returns table (
  user_id uuid,
  username text,
  name text,
  avatar_url text,
  -- How the caller stands with them; the row renders differently for
  -- each and the UI should not need a second call per result.
  friend_status text,
  score real
)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select (select auth.uid()) as id),
  q as (select lower(trim(coalesce(p_query, ''))) as text)
  select
    p.id,
    p.username,
    p.name,
    p.avatar_url,
    coalesce((
      select case
        when f.status = 'active' then 'friends'
        when f.status = 'pending' and f.requester_id = me.id then 'sent'
        when f.status = 'pending' then 'received'
        -- Declined is silent to the person declined (migration 104):
        -- they see `none`, exactly as if they had never asked.
        when f.status = 'declined' and f.requester_id = me.id then 'none'
        when f.status = 'declined' then 'declined_by_me'
      end
      from public.friends f
      where (f.requester_id = me.id and f.addressee_id = p.id)
         or (f.requester_id = p.id and f.addressee_id = me.id)
    ), 'none') as friend_status,
    greatest(
      extensions.word_similarity(q.text, lower(coalesce(p.username, ''))),
      extensions.word_similarity(q.text, lower(coalesce(p.name, '')))
    ) as score
  from public.profiles p, me, q
  where me.id is not null
    and length(q.text) >= 2
    and p.id <> me.id
    and p.username is not null
    and coalesce(p.allow_friend_requests, true)
    and (
      p.username ilike '%' || q.text || '%'
      or p.name ilike '%' || q.text || '%'
      or extensions.word_similarity(q.text, lower(coalesce(p.username, ''))) > 0.3
      or extensions.word_similarity(q.text, lower(coalesce(p.name, ''))) > 0.3
    )
  order by
    -- An exact handle match is what someone typing a handle wants,
    -- ahead of any fuzzy neighbour.
    (lower(p.username) = q.text) desc,
    score desc,
    p.username asc
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;
