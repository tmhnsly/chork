-- ────────────────────────────────────────────────────────────────
-- Inviting a climber to a match
-- ────────────────────────────────────────────────────────────────
--
-- The profile's "Start a match" button opened the door to spam: it
-- let you start a match FROM someone's profile, which reads as doing
-- something to them and does nothing they can decline. What the
-- button should be is an invite — a request the recipient can accept
-- by joining, or ignore.
--
-- ── An invite is a message, not a seat ──────────────────────────
--
-- Inviting someone does NOT add them to the match. It sends them a
-- notification carrying the join code; they join by their own action
-- (`join_match`), exactly as if a friend had read them the code
-- across the gym. So an ignored invite leaves no trace in anyone's
-- stats, a declined one needs no "declined" state, and there is
-- nothing for a spammer to inflict except a notification — which the
-- recipient's existing `push_invite_received` opt-out already covers,
-- and which the sender's `invitesSend` rate limit (10/hour) caps.
--
-- That is why this migration is one line long: the notification kind
-- is the whole feature. Everything else already existed.

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind = any (array[
    'friend_request_received',
    'friend_request_accepted',
    'match_invite_received'
  ]));
