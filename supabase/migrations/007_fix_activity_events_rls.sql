-- 007: Correct the activity_events RLS policy name and apply the null-route fix.
-- Migration 006 used the wrong policy name so the activity_events RLS change
-- was silently skipped. This replaces the actual policy from 002.

drop policy if exists "Gym members can read activity events" on activity_events;

create policy "Gym members can read activity events"
  on activity_events for select
  to authenticated
  using (
    -- Null-route events (user-level activities) are only visible to their owner.
    -- Route-scoped events are visible to gym members.
    (route_id is null and user_id = auth.uid())
    or (route_id is not null and is_gym_member(gym_id))
  );
