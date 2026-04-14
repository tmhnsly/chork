-- 032: per-category push preferences
--
-- Push was gated only by whether the user had subscribed a device
-- and by the global `allow_crew_invites` flag on the invite path.
-- There was no way for a climber to mute accept notifications
-- without muting invites, or vice versa.
--
-- Three discrete bools — kept flat rather than JSONB so Postgres
-- can index/filter on them and the app code stays obvious. Future
-- categories (e.g. route-of-the-week) can bolt on alongside.
--
-- Defaults are true so existing users keep receiving the full set
-- of pushes until they opt out explicitly.

alter table public.profiles
  add column push_invite_received    boolean not null default true,
  add column push_invite_accepted    boolean not null default true,
  add column push_ownership_changed  boolean not null default true;
