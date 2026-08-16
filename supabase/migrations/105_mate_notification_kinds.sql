-- ────────────────────────────────────────────────────────────────
-- Two more notification kinds, for mate requests
-- ────────────────────────────────────────────────────────────────
--
-- A request nobody sees is a request nobody answers, so the mates
-- graph (migration 104) needs the same two events crews already have.
--
-- The check constraint mirrors `NotificationPayloads` in
-- `src/lib/data/notification-kinds.ts` — that comment is on the TS
-- side too. Both have to move together or a `notify()` that
-- typechecks fails at insert time with a 23514.
--
-- The push opt-in columns are reused rather than added to:
-- `push_invite_received` / `push_invite_accepted` already mean "tell
-- me when someone asks / when someone says yes", which is exactly
-- this. Since mates replace crews, a climber who muted crew invites
-- almost certainly wants mate requests muted too.

alter table public.notifications drop constraint if exists notifications_kind_check;

alter table public.notifications add constraint notifications_kind_check
  check (kind = any (array[
    'crew_invite_received',
    'crew_invite_accepted',
    'crew_ownership_transferred',
    'mate_request_received',
    'mate_request_accepted'
  ]));
