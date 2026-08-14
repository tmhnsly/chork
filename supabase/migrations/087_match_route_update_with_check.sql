-- ────────────────────────────────────────────────────────────────
-- A route a player may edit is not a route they may move
-- ────────────────────────────────────────────────────────────────
--
-- Migration 080 added `set_routes_update_by_player` so any player of
-- a live Match can edit any of its routes — deliberately
-- collaborative, see CONTEXT.md "Match".
--
-- It was written with `using` only. `using` decides which rows an
-- UPDATE may *touch*; `with check` decides what those rows may become.
-- With no `with check`, Postgres allows the new row to be anything —
-- so a player of their own Match could set `set_id` to a gym's Set and
-- move a route onto that gym's wall, renumbering it and rewriting its
-- description in the process. They only needed one Match of their own
-- and the target Set's id.
--
-- Nothing has exploited this: no code path issues that UPDATE (the
-- app is still on `jam_*`), which is also why it is cheap to fix now.
-- The rule is the same on both sides — the row must belong to a live
-- Match you are a player of, before AND after.

drop policy if exists set_routes_update_by_player on public.routes;
create policy set_routes_update_by_player on public.routes
  for update to authenticated
  using (
    exists (
      select 1 from public.sets s
      where s.id = set_id
        and s.owner_kind = 'climber'
        and s.status = 'live'
        and public.is_set_player(s.id)
    )
  )
  with check (
    exists (
      select 1 from public.sets s
      where s.id = set_id
        and s.owner_kind = 'climber'
        and s.status = 'live'
        and public.is_set_player(s.id)
    )
  );

-- The same class of hole on `route_logs`, older and wider.
--
-- Migration 073 hardened the INSERT policy so a log has to name the
-- gym its route actually belongs to — otherwise a hand-crafted
-- request could land a log from gym B's wall on gym A's board. The
-- UPDATE policy never got the same treatment: its `with check` is
-- `user_id = auth.uid()` and nothing else, so the owner of a log can
-- rewrite its `route_id` and `gym_id` to whatever they like and put
-- themselves on the board of a gym they have never been to. Same
-- destination as 073's bug, reached by editing instead of inserting.
--
-- The check below is 073's insert condition, applied to the result of
-- the update. Two consequences worth stating rather than discovering:
--
--   • It now also requires the Set to be LIVE. Editing a log on an
--     archived Set was previously allowed even though inserting one
--     was not (migration 003) — "archived Sets are read-only for
--     climbers" is the documented rule and this is what makes it
--     true of both paths.
--   • The upsert in `upsertRouteLog` takes the UPDATE branch when a
--     log already exists, so this governs the ordinary re-tap on the
--     wall, not just hostile edits. A legitimate re-tap changes
--     `attempts`/`completed`/`zone` only and satisfies every clause.
--
-- NOTE the policy name: it is "…their own…". Recreating it under any
-- other spelling would leave the original in place, and permissive
-- policies OR together — the loose one would still admit everything.
drop policy if exists "Users can update their own route logs" on public.route_logs;
create policy "Users can update their own route logs"
  on public.route_logs for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
        from public.routes r
        join public.sets s on s.id = r.set_id
       where r.id = route_id
         and s.id = route_logs.set_id
         and s.status = 'live'
         and (
           (s.owner_kind = 'gym'
             and route_logs.gym_id = s.gym_id
             and public.is_gym_member(s.gym_id))
           or
           (s.owner_kind = 'climber'
             and route_logs.gym_id is null
             and public.is_set_player(s.id))
         )
    )
  );
