-- ────────────────────────────────────────────────────────────────
-- Badge keys follow the rename
-- ────────────────────────────────────────────────────────────────
--
-- The Match rename is otherwise a pure code change: file names, type
-- names, routes. Badge ids are the exception, because they are
-- PERSISTED — `user_achievements.badge_id` stores the key from
-- `src/config/achievements.ts`, and the evaluator's "don't re-issue
-- what's already earned" check compares against it.
--
-- So renaming the config keys without this migration doesn't just
-- mislabel anything: every Match badge silently becomes unearned,
-- and the next evaluation re-issues it with a fresh `earned_at`,
-- rewriting the date someone actually did the thing.
--
-- Production holds two of these today, both real:
--   match-first-match  (was jam-first-jam)
--   match-first-win    (was jam-first-win)
--
-- The mapping is spelled out rather than derived with a string
-- replace, because one of the eight isn't a prefix swap:
-- `jam-first-jam` has the word twice and becomes
-- `match-first-match`, which `'match-' || substring(badge_id from 5)`
-- would have turned into `match-first-jam`.
--
-- Idempotent: re-running matches nothing the second time. Safe to run
-- again after deploy if any straggler rows appear in the window
-- between this migration and the new code going live.

update public.user_achievements
   set badge_id = case badge_id
     when 'jam-first-jam'          then 'match-first-match'
     when 'jam-first-win'          then 'match-first-win'
     when 'jam-reigning-champ'     then 'match-reigning-champ'
     when 'jam-legend'             then 'match-legend'
     when 'jam-host-with-the-most' then 'match-host-with-the-most'
     when 'jam-big-fish'           then 'match-big-fish'
     when 'jam-social-climber'     then 'match-social-climber'
     when 'jam-iron-crew'          then 'match-iron-crew'
     else badge_id
   end
 where badge_id like 'jam-%';

-- A badge id that survived the sweep is one this migration doesn't
-- know about — a key added between writing and applying it. Fail
-- loudly rather than leave it to be re-earned quietly later.
do $$
declare
  stragglers text;
begin
  select string_agg(distinct badge_id, ', ')
    into stragglers
    from public.user_achievements
   where badge_id like 'jam-%';

  if stragglers is not null then
    raise exception 'unmapped jam badge keys remain: %', stragglers;
  end if;
end;
$$;
