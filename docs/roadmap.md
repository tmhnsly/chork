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
      backfill. **This is the one to start with — no design work
      left.**

### Need a design pass first

- [ ] **Jam handicap system.** So stronger and weaker climbers can
      compete in the same jam. Open questions: handicap per climber
      or per grade band; self-declared or derived from history;
      applied to points or to the board. Needs grilling before code.
- [ ] **Jam host/guest mode.** Hosts logging attempts for others, and
      guests playing without an account. Needs schema work
      (`jam_players` requires a `profiles` FK) plus a trust decision —
      anyone in a jam can already edit anything.
- [ ] **Jam activity → crew feed.** One event per jam. Parked by Tom
      pending the wider crew rework; `activity_events` is currently
      only written by gym-wall sends and comments, so a gymless
      climber generates nothing for the feed.

- [ ] **Jams — UX/robustness overhaul.** Shipped half-baked; the feature
      works but doesn't hang together yet. Known gaps (audit 2026-08-10):
      live-player realtime never dispatched (`set-players` reducer action is
      unused, so friends who join mid-jam don't appear until reload); no
      leave-jam UI (server `leaveJam` is ready, no call site); ending a jam
      gives no signal to other open sessions; offline queue only retries
      `TypeError` (silent data loss on any other failure); add/edit/end-route
      and end-jam have no error handling; live leaderboard caps at 5 of 20.
      Needs one coherent pass, not piecemeal fixes.
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
