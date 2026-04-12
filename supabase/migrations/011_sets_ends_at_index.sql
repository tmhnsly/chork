-- 011: Index on sets.ends_at
--
-- Profile page filters `sets` by `gym_id` + `ends_at >= user.created_at`.
-- The gym_id predicate is already indexed (FK), but the date range scan
-- benefits from a composite index.

create index if not exists sets_gym_id_ends_at_idx
  on public.sets (gym_id, ends_at);
