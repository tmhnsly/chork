-- 073: a route log must name the gym its route actually belongs to
--
-- The insert policy checked two of the three things it needed:
--
--   user_id = auth.uid()          -- it's your log
--   is_gym_member(gym_id)         -- you're in that gym
--   route's set is active         -- the set is live
--
-- It never checked that the route belongs to `gym_id`. `routes` has no
-- gym of its own — the chain is routes.set_id → sets.gym_id — and the
-- policy already joins through `sets` for the active check, so it had
-- the value in hand and simply didn't compare it.
--
-- A climber who belongs to two gyms could therefore post a log naming
-- a route from gym B's wall with `gym_id` set to gym A. Both existing
-- conditions pass — they are a member of A, and B's set is live — and
-- the log lands on **A's** leaderboard for a route A doesn't own.
--
-- Not reachable through the app: every logging path takes `gymId` from
-- `requireAuth()` (the caller's `active_gym_id`) and route ids from
-- that gym's current set, so the two always agree. This closes the
-- hand-crafted request, and makes the invariant the schema's job
-- rather than a property of how the UI happens to call it.
--
-- The board is only "just for that gym" if a log can't name the wrong
-- one, which is the whole point of `route_logs.gym_id` existing
-- alongside the route reference.
drop policy if exists "Users can insert own route logs in active sets" on public.route_logs;

create policy "Users can insert own route logs in active sets"
  on public.route_logs for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and public.is_gym_member(gym_id)
    and exists (
      select 1
        from public.routes r
        join public.sets s on s.id = r.set_id
       where r.id = route_id
         and s.active = true
         -- The new clause. `route_logs.gym_id` is qualified because
         -- the sub-select also has a `gym_id` in scope via `sets`.
         and s.gym_id = route_logs.gym_id
    )
  );
