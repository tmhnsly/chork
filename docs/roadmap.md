# Chork roadmap

## Shipped

Core climber experience:
- [x] Punch card: log attempts, complete routes, flash tracking
- [x] Points system (flash=4, 2=3, 3=2, 4+=1, zone=+1)
- [x] Beta spray comments on routes with opacity-blur reveal
- [x] Community grades (average of grade votes)
- [x] Climber profiles with stats, ring cluster, set history
- [x] Multi-gym with gym picker during onboarding
- [x] RLS isolation on every gym-scoped table
- [x] Offline mutation queue (IndexedDB) with retry on reconnect
- [x] PWA manifest, standalone mode, service worker, viewport
- [x] Auth (email + password) via Supabase

Social + competitive:
- [x] Chorkboard — gym-wide leaderboard with set / all-time tabs,
      podium, neighbourhood rows, peek sheet with send grid
- [x] Crew feature — mutual groups with private leaderboard +
      activity feed. Replaces follows (migration 020)
- [x] Per-crew detail route (`/crew/[id]`) with Activity /
      Leaderboard / Members tabs
- [x] Fuzzy user search (pg_trgm) with block list + rate limit
- [x] Crew ownership transfer (migration 031)
- [x] Achievements + badges with persistent earned-at
- [x] Competitions (multi-gym) with category filter + organiser role
- [x] PWA push notifications — per-category opt-out (invite /
      accept / ownership) + persistent in-app log that survives
      dropped pushes (migrations 032 + 033)

Admin / gym owner:
- [x] Gym admin signup + separate admin role table (`gym_admins`)
- [x] Sets CRUD with grading scale (V / Font / Points-only)
- [x] Routes editor — per-row bottom sheet with zone toggle, setter
      name, tag chips (replaces tucked-away 3-dot menu)
- [x] `pg_cron`-scheduled auto draft → live on start date
- [x] Admin dashboard widgets: set overview, top routes,
      engagement, flash leaderboard, zone-vs-send, setter breakdown,
      all-time, competition venue stats, **set pace**, **flash
      rate buckets**, **stale routes**
- [x] Sticky admin sub-nav, streamed dashboard via Suspense
- [x] This-set / all-time view toggle
- [x] Admin invites with token + expiry + email-address gate

Platform hardening:
- [x] Every RPC with `SECURITY DEFINER`, `search_path=''`,
      explicit grants
- [x] Every RLS policy wraps `auth.uid()` in `(select …)`
- [x] FK indexes on every column used in RLS filters
- [x] Middleware onboarded cookie — skips per-request Supabase check
- [x] Cached `getServerUser` / `getServerProfile` React cache helpers
- [x] Security headers (HSTS, X-Frame-Options SAMEORIGIN,
      Permissions-Policy, Referrer-Policy)
- [x] `global-error.tsx` last-resort boundary for root-layout crashes
- [x] `gym_admins` SELECT tightened to self + fellow admins
      (migration 034) — previously readable by any authed user
- [x] `joinCompetition` gym-scope gate; `linkCompetitionGym` /
      `unlinkCompetitionGym` organiser-or-admin explicit gate
- [x] Per-user theme preference (migration 028) with
      `theme-store.ts` split from the provider for testability
- [x] robots.ts + sitemap.ts

---

## Pre-launch (before going public)

- [ ] Buy domain (chork.app or similar)
- [ ] Verify domain in Resend → add DNS records in Cloudflare
- [ ] Configure Supabase SMTP with Resend
- [ ] Cloudflare email forwarding (hi@chork.app → personal)
- [ ] Enable "confirm email" in Supabase Auth
- [ ] Update Supabase redirect URLs for production domain
- [ ] Set VAPID env vars in Vercel (see `.env.example`)
- [ ] Google OAuth (add back)
- [ ] Apple Sign In

## Infrastructure (before scaling)

- [x] Rate limiting on server actions (Upstash sliding-window,
      `src/lib/rate-limit.ts`)
- [x] Error monitoring (Sentry — `sentry.{client,server,edge}.config.ts`)
- [ ] Database connection pooling (Supabase config verify)
- [ ] Scheduled backups verified restorable

## Next up

> **Session convention:** these are picked up when Tom says
> **"feature time"**. Bug-fix sessions leave this list alone.

### Product direction (decided 2026-08-14, grilled)

The strategy every item below serves. See CONTEXT.md for the
vocabulary these decisions produced.

- **Group-first, not solo-first.** Griptonite and Redpoint own the
  solo logbook; we won't win there and shouldn't try. Chork is
  deliberately thin for a lone climber and excellent for 2–6 mates.
  The defensible product is what happens on the mats between people.
- **The free thing becomes the paid thing.** A Match is the same
  primitive as a gym Set, so the sales conversation is "your members
  ran 40 Matches here last month — press this to make Tuesday's comp
  official", not "buy this admin system you've never used". Every
  Match at a gym is also outbound signal.
- **What gyms actually buy is repeat footfall.** A long-running
  numbered Set gives members a reason to come back midweek. That's
  the monthly value; comps and dashboards are how it's delivered.
- **Multi-discipline from the start.** Boulder, sport, top-rope.
  Discipline defaults per Set, overridable per route.
- **The growth loop is the group chat, not an in-app feed.** Climbers
  already have WhatsApp. Don't compete with it — feed it.

### Designed and ready to build

- [ ] **Grades graph.** Distribution pyramid of grades sent, flashes
      tinted amber, on the profile. Design fully settled (grilled
      2026-08-14) — every decision is recorded in the header of
      `supabase/migrations/076_jam_grade_retention.sql`:
      gym + jam sends combined; per-(climber, grade) rollup; attempts
      deliberately not stored; visible to any signed-in user; raw
      `(grade, scale)` stored and converted at display to the
      climber's most-used scale; excluded climbs counted in
      `jam_summary_players.ungraded_sends` so the UI can say what it
      left out. Retention shipped and live (076/077), so jam data has
      been accruing since; gym data is full history and needs no
      backfill.

      **⚠️ One decision is now void.** "Converted at display to the
      climber's most-used scale" pre-dates the multi-discipline
      decision and breaks the moment someone logs both boulders and
      ropes: a 6a+ cannot be rendered as a V-grade. The graph must be
      **per discipline** — one pyramid for boulders, one for ropes —
      and the rollup needs discipline alongside `(grade, scale)`.
      Cheap to fix now (nothing built); annoying once 076 has data
      behind it. Everything else in that header still stands.

- [ ] **Match result share card.** The single highest-leverage growth
      feature, and small. When a Set ends, produce an image + link
      worth pasting into the group chat: winner, placements, the
      numbers, a join code. Works before any social graph exists,
      feeds the channel climbers already use, and turns the
      trophy/placement moment we already decided on into recruitment.
      Build this before any in-app feed.

### Need a design pass first

- [ ] **The Set convergence.** The structural change everything else
      waits on. A Match and a gym Set are one primitive at different
      settings (owner, lifetime, route source), so they become one
      family instead of `jam_*` mirroring `route_*`. Decided with
      full rewrite explicitly on the table — the only user is Tom, so
      this is the cheapest it will ever be.

      Sequence it, don't big-bang it: **unify the log + scoring layer
      first** (reversible, and it deletes `scoring-parity.test.ts`'s
      reason to exist by leaving one implementation instead of two
      that must agree), **then the containers**.

      What it deletes: parallel scoring, parallel leaderboards,
      duplicate row types, and the whole collapse-to-summary
      machinery — `jam_summaries` / `jam_summary_players` /
      `end_jam`'s aggregation exist only because Matches were treated
      as disposable. As Sets they keep their rows like anything else,
      which also removes the `row_number` vs `dense_rank` tie
      divergence recorded in CONTEXT.md.

      The hard part, to design carefully rather than rush: **RLS must
      cover two access models** — gym Sets gated on `is_gym_member`,
      Matches on a join code. Also carry `discipline` onto the
      container while it's free, and rename `jam*` → `match*` in the
      same pass.

      **Phase 1 landed 2026-08-14** (migrations 080 + 081). `sets` now
      hosts both owners, `route_logs` carries a trigger-derived
      `set_id`, `set_players` + `is_set_player` / `can_read_set` exist,
      and every sets/routes/route_logs policy is a two-branch superset
      of what it was. Purely additive: `jam_*` is untouched and still
      the only thing the app reads. Safe to apply because `jams` /
      `jam_routes` / `jam_logs` were verified empty in production
      first — the convergence is structural, with nothing to backfill.

      **Phase 2a landed 2026-08-14** (migrations 082–084). The RPC
      layer exists on the converged tables — `create_match`,
      `lookup_match_by_code`, `join_match`, `add_match_route`,
      `get_match_leaderboard`, `get_match_state_for_user`,
      `end_match`, `end_stale_matches` — plus `set_grades` and the
      activity triggers. Additive and inert: nothing calls them yet
      and no `jam_*` function was touched. Verified end to end
      against production inside a rolled-back transaction (create →
      add routes → log → board → 7 points, correct to the ladder).

      Two things it fixes rather than ports: the board is now
      **gated** (`get_jam_leaderboard` has no access check, so anyone
      holding a jam id can read it), and the attempt mask resolves
      against a viewer the service-role path can name (the jam
      version masks the caller's own attempts too). And `end_jam` is
      not ported at all — a Match is a Set, Sets keep their rows, so
      ending one is `status = 'archived'`.

      082 is worth remembering: `user_set_stats.gym_id` was NOT NULL
      and its trigger fires inside the writer's transaction, so the
      first Match log would have failed the *send*, not just the
      stats. Latent since 080. Look for that shape again when
      widening anything else gymless.

      **Still open, in order:**

      - [ ] Point the Match UI at the new RPCs and drop `jam_*`. Note
            the scope is smaller than it looks: logging needs no new
            code at all (`upsertRouteLog` already serves both), and
            scoring is already single-sourced through
            `compute_points` / `computePoints`. What actually merges
            is the containers, the row types (`JamLog` → `RouteLog`
            etc.) and the realtime channel.
      - [ ] Realtime: `use-jam-realtime` listens to `jam_routes` /
            `jam_logs` / `jam_players` filtered by `jam_id`. The
            converged equivalents need adding to the
            `supabase_realtime` publication with `REPLICA IDENTITY
            FULL`, filtered on `set_id` — and `route_logs` is a much
            busier table, so the filter matters more than it did.
      - [ ] Offline queue: `registry.ts` hard-imports
            `upsertJamLogAction`. Re-point it at the shared route-log
            action rather than porting a second entry.
      - [ ] Retire `jam_summaries` — but note the share card (shipped)
            reads `share_token` off it, so that moves to whatever
            replaces it rather than being deleted with it.
      - [ ] Rename `jam*` → `match*` across code and DB, last, when
            nothing is reading the old names.

- [ ] **Guest players (the growth unlock).** Joining is the thirty
      seconds in which one climber recruits another, and today it
      costs install → sign up → code. `jam_players.user_id` is NOT
      NULL against `profiles`, so identity *is* the account.

      Decided: **Supabase anonymous sign-in**, claimable later. The
      guest gets a real `auth.users` row, so `handle_new_user` gives
      them a profile, so the FK holds and **every RLS policy already
      written keeps working**. Claiming is `updateUser` with an
      email, and their history comes with them. Host-logs-for-a-guest
      is the fallback for someone who won't install anything at all —
      but note it's an *anti*-acquisition feature, since that guest
      never opens the app.

      Costs to handle: no username until claimed, a cleanup policy
      for anon rows that never convert, and the onboarding
      middleware must not shove a guest into signup.

      Trust stays permissive — anyone in a Match can edit anything.
      It's mates on mats; the social contract is the enforcement.
      Verification machinery belongs only to gym-sanctioned Sets.

- [ ] **Handicap.** Scores each send relative to the climber's own
      ceiling, so a V3 and a V8 climber can share a board honestly.
      **Matches only, never gym Sets** (a gym Set carries the gym's
      name and prizes; handicap is self-declared and soft).
      Ceilings are **per discipline**. Self-declared at first;
      suggested from recent sends once there's history, so it can't
      be casually sandbagged.

- [ ] **Mates (replaces Crew).** Crews need creating, inviting and
      accepting — three steps before any value, and every crew is
      empty at launch. Replace with a mutual follow graph; value at
      one connection.

      Feed content is **moments, not ticks**: first V6, project sent
      after five sessions, flash above usual grade, Set won. Note
      `activity_events` is currently written only by gym-wall sends
      and comments, so a gymless climber generates nothing — exactly
      backwards for a group-first product.

      Ship the share card (above) *before* the feed: it works with no
      network at all.

- [ ] **Game modes.** Chork (the HORSE variant) and whatever follows.
      Blocked on the convergence — build them on one engine or build
      each one twice.

- [ ] **Match UX/robustness overhaul.** Shipped half-baked; the
      feature works but doesn't hang together yet. Known gaps (audit
      2026-08-10): live-player realtime never dispatched
      (`set-players` reducer action is unused, so friends who join
      mid-Match don't appear until reload); no leave UI (server
      `leaveJam` is ready, no call site); ending gives no signal to
      other open sessions; add/edit/end-route and end have no error
      handling; live leaderboard caps at 5 of 20. Needs one coherent
      pass, not piecemeal fixes — and best done *with* the
      convergence rather than before it, since the container is
      changing underneath. (The offline-queue data loss from this
      list was fixed 2026-08-14.)

- [ ] **Card + Ranks merge.** Agreed in principle: they're the same
      context ("my gym, right now") and the bottom nav is one tab
      lighter for it. Deferred deliberately — Tom likes both surfaces
      as they stand, so this needs its own design session rather than
      a mechanical merge. The `tabpanel` wiring it needs already
      exists.
- [ ] **Admin flow — full design pass.** Never fleshed out as a
      journey; it grew per-feature. The 2026-08-14 architecture sweep
      found the seams that implies. Open product questions first, then
      code:

      **Multi-gym is unreachable.** All 6 admin pages call
      `requireGymAdmin()` with no argument, which resolves to the
      *oldest* `gym_admins` row. An owner of gyms A and B gets a hard
      404 on every Set belonging to B (`sets/[id]/page.tsx` authorises
      by `getAllSetsForAdminGym(gymId).find(...)` → `notFound()`).
      There is no gym picker anywhere in the admin shell —
      `AdminNav` is 3 static links, and `getAdminGymsForUser` exists
      but is used only by the competition gym-link dropdown. Needs:
      does an admin pick a gym in the shell (like the climber's gym
      switcher), or does every admin route carry a gym in its path?

      **The invite journey is half-built.** `sendAdminInvite` +
      `cancelAdminInvite` are fully implemented and tested, and have
      **zero non-test callers** — no team/invites surface exists. Only
      acceptance (`/admin/invite/[token]`) is reachable. Either build
      the team screen or delete the endpoints.

      **Publish semantics need deciding, not patching.** Create-live
      now requires seeded routes (a live Set with no routes is an
      empty Wall), so /admin/sets/new's "Publish" button can never
      succeed — the console has no route input at create time. Should
      the console create-as-draft only and drop Publish, and does
      going live from the console announce to the gym? (See the
      Announcement question below.)

      **Client and server constraints have drifted**, not duplicated:
      route count `max={50}` vs `max={100}` vs server `1..100`; setter
      name `maxLength={40}` vs server `> 80` rejected. One authority
      needed per field.

      **Nothing is tested or storied.** 26 admin component files, 0
      tests, 0 stories. 9 of 18 admin server actions have no test —
      all 6 competition actions among them. `SetForm`'s
      status-derivation is a closure, so the bug that unpublished live
      Sets was structurally invisible; a pure
      `setFormPayload(mode, publishing, fields)` would be testable.

      Smaller cleanups to fold in: `adminControls.module.scss` is 36%
      dead; 6 admin stylesheets keep pre-`PageHeader` title blocks;
      `getCommunityGradeDistribution` has zero callers; three
      one-line `archiveSet`/`publishSet`/`unpublishSet` pass-throughs;
      the `SetterBreakdown`/`VenueStats` widgets are structural twins
      (bar-row markup + SCSS duplicated 3×); `FormField` exists and no
      admin form uses it (4 hand-rolled copies); demoting an incumbent
      Set busts `gymActiveSet` but not that Set's `setLeaderboard`.

- [ ] Closing-event UI (data model in place — `closing_event` +
      `venue_gym_id` on sets)
- [ ] Invite email delivery for `gym_invites` (current flow
      produces a link; email plumbing ships with the SMTP task above)
- [x] Avatar uploads via Supabase Storage (magic-byte validated)
- [ ] Route QR codes (scan to open route-log sheet)
- [ ] Comment threading UI (`parent_id` exists in schema)

## Planned

- [ ] Kudos / reactions on activity events
- [ ] Grade pyramids on profiles
- [ ] Gym subscription billing (Stripe wired into `plan_tier`)
- [ ] Competition event management UI (rounds, qualifiers, finals)
- [ ] Climber-facing streaks and personal records
- [ ] Setter-facing analytics (engagement per author across sets)
