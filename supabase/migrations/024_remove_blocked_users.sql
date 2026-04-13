-- 024: Remove blocked_users
--
-- The app-level block feature is being removed. Climbers can control
-- who reaches them via `profiles.allow_crew_invites` — toggling that
-- off stops invites wholesale, which is simpler than maintaining a
-- per-user block list. If a climber really wants to stop a specific
-- person, they can leave the crew they share with them.
--
-- Dropping the table also removes its policies + indexes. Nothing
-- else in the schema references it (migration 021 did a left-join
-- from search → blocked_users purely in-app).

drop table if exists public.blocked_users cascade;
