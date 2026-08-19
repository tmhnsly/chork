-- ────────────────────────────────────────────────────────────────
-- Finding a climber by name
-- ────────────────────────────────────────────────────────────────
--
-- The friends screen gets a search bar, and there was already a
-- search function to power it — `search_climbers_fuzzy`, from the crew
-- era. It has been BROKEN since migration 108: it reads
-- `p.allow_crew_invites`, which 108 renamed to `allow_friend_requests`,
-- so every call raises 42703. Nothing noticed because nothing called
-- it; 108's sweep enumerated functions by `%crew%` in the NAME and this
-- one's name never mentioned crews. Deleted here — a broken function
-- with a plausible name is a trap for the next person.
--
-- ── What the replacement respects ───────────────────────────────
--
-- `allow_friend_requests` is enforced, so a climber who opted out
-- cannot be found — the same switch that hides them from suggestions
-- and refuses `request_friend`. A privacy setting the search ignores
-- is decoration.
--
-- Guests are not profiles and never appear. The caller is excluded
-- from their own results.
--
-- Callers already linked to you in any state are still RETURNED, with
-- the state — search is "find this person", and finding a friend or a
-- pending request is a valid answer that the UI renders differently.
-- Suggestions exclude linked people because their job is discovery;
-- search's job is lookup.
--
-- ── Rate limit lives in the action ──────────────────────────────
--
-- The old crew search had a per-user quota. Fuzzy search over
-- profiles is cheap and the results are already public in-app, so the
-- standard mutation rate limit on the server action is enough here;
-- a bespoke quota is a second thing to keep correct for no threat it
-- would stop.

drop function if exists public.search_climbers_fuzzy(text, uuid, integer);

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

revoke execute on function public.search_climbers(text, integer) from anon, public;
grant execute on function public.search_climbers(text, integer) to authenticated;
