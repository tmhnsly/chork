-- ────────────────────────────────────────────────────────────────
-- Shareable match results
-- ────────────────────────────────────────────────────────────────
--
-- A finished Set/Match result is the artefact worth pasting into a
-- group chat — winner, placements, a link. For that link to unfurl
-- in WhatsApp and be readable by someone who wasn't there, it has to
-- be reachable WITHOUT auth.
--
-- That conflicts with how summaries are read today:
-- `get_jam_summary_for_user` (migration 055) deliberately 404s for
-- non-participants so summary ids can't be walked. We keep that
-- property and add sharing as an explicit, opt-in act:
--
--   • A participant taps Share. The app mints an unguessable token
--     (24 random bytes, base64url) and stores it here.
--   • The public page is server-rendered by Next and reads through
--     the SERVICE client, so nothing new is granted to `anon` and no
--     RLS policy changes. The token is the capability.
--   • Never minted = never shareable. Nothing becomes public by
--     default, and existing summaries stay exactly as private as
--     they are now.
--
-- Deliberately NOT an RPC: participation is already gated by the
-- audited `get_jam_summary_for_user` path the app calls first, so a
-- second SECURITY DEFINER gate would be a second thing to keep
-- correct. Token generation lives in the app (`node:crypto`), which
-- also avoids depending on pgcrypto being present.
--
-- Privacy: whatever renders on that page is public to anyone holding
-- the link. `jam_summary_players.attempts` MUST NOT be among it —
-- see CONTEXT.md "Attempt privacy". The read helper selects columns
-- explicitly rather than `*` for exactly that reason, and
-- `attempt-privacy.test.ts` pins the wire shape.

alter table public.jam_summaries
  add column if not exists share_token text;

-- Unique so a token identifies exactly one result; partial because
-- the overwhelming majority of summaries are never shared.
create unique index if not exists jam_summaries_share_token_key
  on public.jam_summaries (share_token)
  where share_token is not null;

comment on column public.jam_summaries.share_token is
  'Unguessable capability for the public result page (/r/<token>). '
  'Null until a participant explicitly shares. Minted app-side; the '
  'public page reads via the service client, so no anon grant exists.';
