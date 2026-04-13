-- ─────────────────────────────────────────────────────────────────
-- Migration 027 — fuzzy climber search via pg_trgm
--
-- The existing `searchClimbersForInvite()` uses `ilike '%q%'` which
-- misses typos and near-matches ("Magns" doesn't find "Magnus").
-- Trigram indexes + `word_similarity()` catch those while staying
-- fast at scale.
--
-- We ship a SECURITY DEFINER RPC rather than calling similarity
-- inline from the client: it lets us bypass RLS just long enough to
-- rank candidates, then returns the same projection the old ilike
-- path produced. Caller filters stay in-app (blocks, shared crews).
-- ─────────────────────────────────────────────────────────────────

create extension if not exists pg_trgm;

-- Trigram GIN indexes — `%` and `word_similarity` both hit these.
create index if not exists profiles_username_trgm_idx
  on public.profiles using gin (username gin_trgm_ops);

create index if not exists profiles_name_trgm_idx
  on public.profiles using gin (name gin_trgm_ops);

-- Fuzzy username/name search. Returns candidates ordered by the
-- best of the username-match or name-match similarity scores. The
-- 0.2 threshold is permissive — typos of 1-2 characters still match,
-- but unrelated strings don't.
create or replace function public.search_climbers_fuzzy(
  p_query     text,
  p_caller_id uuid,
  p_limit     int default 40
)
returns table (
  id                 uuid,
  username           text,
  name               text,
  avatar_url         text,
  active_gym_id      uuid,
  allow_crew_invites boolean,
  score              real
)
language sql stable security definer
set search_path = ''
as $$
  select p.id,
         p.username,
         p.name,
         p.avatar_url,
         p.active_gym_id,
         p.allow_crew_invites,
         greatest(
           word_similarity(lower(p_query), lower(coalesce(p.username, ''))),
           word_similarity(lower(p_query), lower(coalesce(p.name, '')))
         ) as score
    from public.profiles p
   where p.id <> p_caller_id
     and p.allow_crew_invites is true
     and (
       p.username ilike '%' || p_query || '%'
       or p.name ilike '%' || p_query || '%'
       or word_similarity(lower(p_query), lower(coalesce(p.username, ''))) > 0.2
       or word_similarity(lower(p_query), lower(coalesce(p.name, '')))     > 0.2
     )
   order by score desc,
            -- deterministic tiebreaker so pagination is stable
            p.username asc
   limit p_limit;
$$;

grant execute on function public.search_climbers_fuzzy(text, uuid, int)
  to authenticated;
revoke execute on function public.search_climbers_fuzzy(text, uuid, int)
  from anon, public;
