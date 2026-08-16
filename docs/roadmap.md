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

## Known fragility

- [x] **Production builds depend on fonts.gstatic.com.** *(Fixed
      2026-08-15 — self-hosted via `next/font/local`; `src/lib/fonts.ts`
      is the single swap point. Original note kept for the reasoning.)*
      `src/app/layout.tsx` uses `next/font/google` (Archivo), and both
      OG image routes fetch a Google font at request time via
      `src/lib/og-fonts.ts`. A build that can't reach Google fails
      outright — this happened on 2026-08-14, when the deploy for
      `732983b` died on "module not found" for the Archivo CSS while
      the preview build of the identical tree had succeeded two
      minutes earlier. A retrigger fixed it, which is the tell.

      Self-host the font files instead: drop the woff2s in `public/`
      and use `next/font/local`. Removes a third-party dependency from
      the deploy path and from every OG render, and is faster on both.
      Cheap, and worth doing before launch rather than after the first
      failed deploy someone else notices.

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
  Discipline defaults per Set, overridable per route. *(Shipped
  2026-08-15, migrations 091–093.)*
- **The growth loop is the group chat, not an in-app feed.** Climbers
  already have WhatsApp. Don't compete with it — feed it.

### Designed and ready to build

- [x] **Grades graph.** *(Shipped 2026-08-15, migration 094.)* Distribution pyramid of grades sent, flashes
      tinted amber, on the profile. Design fully settled (grilled
      2026-08-14) — every decision is recorded in the header of
      `supabase/migrations/076_jam_grade_retention.sql`:
      gym + jam sends combined; per-(climber, grade) rollup; attempts
      deliberately not stored; visible to any signed-in user; raw
      `(grade, scale)` stored and converted at display to the
      climber's most-used scale; excluded climbs counted in
      `jam_summary_players.ungraded_sends` so the UI can say what it
      left out.

      **⚠️ Two of those decisions are now void.**

      1. "Converted at display to the climber's most-used scale"
         pre-dates the multi-discipline decision and breaks the moment
         someone logs both boulders and ropes: a 6a+ cannot be
         rendered as a V-grade. The graph must be **per discipline** —
         one pyramid for boulders, one for ropes — and the rollup
         needs discipline alongside `(grade, scale)`.
      2. **The storage described in 076 no longer exists.**
         `jam_summary_grades` and `jam_summary_players.ungraded_sends`
         were dropped with the rest of the family in migration 089.
         Nothing was lost — the table had accrued 0 rows in its
         lifetime, because it was only ever written by `end_jam` and
         read by nothing.

      That is a better starting position than it sounds. The
      convergence means Match sends are ordinary `route_logs` rows
      with a `declared_grade` on their route, so the graph can roll
      up gym and Match sends together, from live rows, with no
      snapshot table to keep in sync and no backfill. Everything in
      076's header about *shape* (per-(climber, grade), attempts
      deliberately absent, visible to any signed-in user, say what
      was excluded) still stands; only its storage plan is void.

- [x] **Match result share card.** *(Shipped 2026-08-14.)* When a Set
      ends, `/r/<token>` renders the result and unfurls in a group
      chat: winner, placements, the numbers. The token is a
      capability minted only when a participant taps Share, read
      through the service client, so nothing is granted to `anon` and
      unshared results stay private. Attempts are absent from the
      payload by construction, not filtered out.

      Still to add: a join code on the card, so a reader can act on
      it rather than only admire it.

### Need a design pass first

- [x] **The Set convergence.** *(Shipped 2026-08-15, migrations 082–093.)*
      The structural change everything else
      waits on. A Match and a gym Set are one primitive at different
      settings (owner, lifetime, route source), so they become one
      family instead of `jam_*` mirroring `route_*`. Decided with
      full rewrite explicitly on the table — the only user is Tom, so
      this is the cheapest it will ever be.

      Sequence it, don't big-bang it: **unify the log layer first**
      (reversible), **then the containers**.

      ⚠️ An earlier version of this line said the convergence would
      delete `scoring-parity.test.ts`'s reason to exist. That was
      wrong, and phase 2b proved it: scoring was never duplicated
      across jam and gym — both already went through `computePoints`
      in TS and `compute_points` in SQL. The TS↔SQL parity
      requirement comes from recomputing the live board client-side
      from realtime events, which is orthogonal to this work and
      survives it.

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

      **Phase 2b landed 2026-08-14** (migrations 085–088). The Match
      UI now runs entirely on the converged tables. `jam_*` is no
      longer read by anything in `src/`.

      What actually moved, and what didn't:

      - Logging did NOT become "no code" as phase 1 predicted. It
        needs one RPC after all, for `completed_at` alone — its value
        depends on the row's previous state, and a plain upsert
        restamps it, which reorders tied climbers because
        `last_send_at` is the board's fourth tiebreak.
      - Scoring never was duplicated: `computeJamLeaderboard` already
        delegated to `computePoints`, and the SQL side to
        `compute_points`. The TS↔SQL parity requirement is inherent
        to recomputing the live board client-side, not to the
        jam/gym split, so `scoring-parity.test.ts` keeps earning its
        keep. The earlier note here overstated that.
      - What did die: the summary collapse. `end_jam`'s 110 lines,
        `jam_summaries` / `jam_summary_players` / `jam_summary_grades`
        as a read path, and the `row_number()` vs `dense_rank()` tie
        divergence — one `match_standings` now ranks history, the
        live board and the shared card alike.
      - The share card's seam held exactly as designed: only the two
        function bodies in `shared-result.ts` changed, and previously
        shared links keep resolving.

      Verified by an 11-case integration suite that runs against the
      real database (`match-state.integration.test.ts`), including
      the negative cases the convergence makes newly important —
      Match writes must not reach the gym wall now that they share
      `routes` and `route_logs`.

      087 is the one to remember: 080 wrote the Match route UPDATE
      policy `using`-only, so a player could repoint a route's
      `set_id` at a gym's Set. The same audit found `route_logs`
      UPDATE had carried a `user_id = auth.uid()` check and nothing
      else since long before this work — the owner of a log could
      rewrite its `gym_id` onto any gym's board. Migration 073 fixed
      that for inserts; nobody checked the edit path.

      **Phase 3 landed 2026-08-15** (migrations 089 + 090). The
      `jam_*` family is gone from the database — 8 tables, 21
      functions, plus `get_user_all_time_stats`, the only
      non-jam-named function that read them. The code is renamed
      throughout: files, the `/jam` → `/match` route, types, badge
      keys. **The convergence is complete.**

      Two things worth carrying forward from it:

      - Dropping had to go **tables before functions**, the opposite
        of the intuitive order, because every jam table's RLS
        policies depended on `is_jam_player(uuid)`. Dry-running the
        migration inside a rolled-back transaction is what caught it.
      - Badge ids are persisted in `user_achievements.badge_id` and
        the evaluator's "already earned" check compares against them,
        so a config rename without migration 090 would have silently
        unearned every Match badge and re-issued it with a fresh
        date. Two real badges were affected. Any future badge rename
        has the same shape.

      The one deliberate leftover: `registry.ts` keeps an
      `upsertJamLog` alias beside `upsertMatchLog`, because the key is
      what gets written into IndexedDB — a device that queued a log
      while offline before the rename still names the old action.
      Delete it once no client can plausibly hold a pre-rename queue.

      **Still open:**

      - [ ] `jam_summary_grades` held the per-grade breakdown and was
            write-only even before the convergence — nothing ever read
            it. Dropped with the rest in 089, so the grades graph
            below now needs its own rollup over `route_logs`. That is
            arguably better: it can cover gym and Match sends
            together, from live rows, per discipline.

- [x] **Guest players (the growth unlock).** *(Shipped 2026-08-15, migrations 095–097. Guests have no account at all — a named seat the host logs for.)*
      Joining is the thirty
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

- [x] **Handicap.** *(Shipped 2026-08-15, migrations 098–101. Taper 1 / .7 / .4 then nothing; the cutoff IS the balance — see `src/lib/data/handicap.ts`.)*
      Scores each send relative to the climber's own
      ceiling, so a V3 and a V8 climber can share a board honestly.
      **Matches only, never gym Sets** (a gym Set carries the gym's
      name and prizes; handicap is self-declared and soft).
      Ceilings are **per discipline**. Self-declared at first;
      suggested from recent sends once there's history, so it can't
      be casually sandbagged.

- [x] **Friends (replaced Crew).** *(Phases 1–2 shipped 2026-08-16,
      migrations 104–108. Crews removed entirely.)* Mutual link,
      candidates suggested from Matches you've shared, plus the
      set-scoped board crews were actually for. `allow_friend_requests`
      is enforced in `request_friend`, not just the UI.

      **Moments shipped 2026-08-16** (migrations 109–110). Friends at
      different gyms
      share no Set, so the board is empty for them and nothing else in
      the app shows one to the other. That is the whole reason a feed
      exists, and it resolves the apparent conflict with "the growth
      loop is the group chat": that principle governs *your own*
      results going out (the share card), not seeing someone else's.

      Four kinds, all DERIVED at read time — nothing stored, same rule
      as points and community grades, so there's no backfill and a
      missed write can't lose a moment forever:

      - New personal best grade, per discipline
      - Won a Match (taps through to the public result card)
      - Earned an achievement (`user_achievements.earned_at`)
      - Placed in a gym competition (`competition_participants` +
        `get_competition_leaderboard`, gym via `competition_gyms`) —
        the most commercially interesting of the four, since it makes
        a gym's comp visible to climbers at other gyms

      Deliberately NOT a moment: "flashed above their usual grade".
      "Usual" needs a fuzzy rule, and a fuzzy rule produces moments
      people argue with.

      Two things the build settled that the design hadn't: personal
      bests partition by discipline AND grading scale (a V5 and a
      font 5 are different climbs), and only the hardest best per day
      survives — the first version reported every rung of a session.

      Competition placings are podium-only. "Finished 47th" is a fact,
      not a moment, and the reason the kind exists is to make one
      gym's comp visible to climbers at another — which a podium does
      and a long tail doesn't. Untested against real data: there are
      no competitions yet.

      `src/lib/data/activity-time.ts` (`relativeDay`) is kept unused
      for this: coarse timestamps are a privacy contract with
      anti-regression tests, and re-deriving them later is how the
      rule stops being true.

- [x] **Game modes.** Chork (the HORSE variant) and whatever follows.
      *(Shipped 2026-08-16, migrations 111–113.)* Convergence
      unblocked it. Rules in CONTEXT.md "Chork (the game mode)".

      One engine, as planned: `sets.game_mode` is a lens on a Match
      exactly like `handicap`, so the container, routes, players and
      logs are all reused and only the win condition differs.

      Rejected on the way: flash-for-flash (comes free as the N=1 case
      of the rule we chose, so nothing is lost); setter names a
      free-text constraint (unverifiable — the app stops refereeing
      and becomes a scoreboard); rotating the pen every round (loses
      the streak tension, and setting well earns you nothing); and
      capping challenge difficulty for balance (takes the pen off the
      strongest climber rather than helping the weakest).

      **Every rule lives in SQL**, and that was not a style choice.
      Each one needs another climber's raw attempt count — the
      allowance is the setter's, a letter is measured against it, and
      the pen turns on whether the setter sent their own challenge —
      and raw attempts are private to their owner. A first pass put
      the pen on the client, where it could only compute from data it
      was not allowed to have; every viewer who wasn't the setter saw
      it on the wrong climber. `src/lib/data/chork.ts` is now the
      display side only, and says so.

      **Two bugs no SQL test would have caught**, both found by
      playing a game rather than reading the rules (114–116). The pen
      left you the instant you set a route, because an unsent
      challenge read as a failed one — right for a finished round,
      wrong for the minute between putting a route up and pulling on
      it. And a guest could never take a turn at all: a route the host
      set on their behalf was recorded against the host's account, so
      the pen bounced straight back. Chork is now expressed entirely
      in seats, which removes the identifier translation that had
      produced four separate bugs.

      The lesson is cheap to write down and was expensive to learn:
      dry-running the rules proves the arithmetic, and says nothing
      about whether the game can be played.

      **Still open: the ceiling is self-declared.** The allowance
      buys a climber one extra go per grade above their stated limit,
      and nothing checks that limit against what they actually climb.
      Among mates in a room that is fine; the fix when it matters is
      to suggest a ceiling from send history rather than to police
      the number.

- [x] **Match UX/robustness overhaul.** *(Shipped 2026-08-16,
      migrations 102–103.)* Every gap from the 2026-08-10 audit is
      closed:

      - **Live-player realtime.** The `set-players` action existed and
        was tested but nothing dispatched it — `useReducer`'s third
        argument runs once, so the `router.refresh()` on join/leave
        fetched a fresh roster the reducer then discarded. Now synced
        from the prop at render time.
      - **Leave.** `leaveMatchAction` has a call site. Leaving parks
        the seat: you keep your points and your rank, marked "Left",
        and lose only the ability to log more. That needed the
        `is_set_player` (read) / `is_active_set_player` (write) split
        in migration 102 — the same rule gym memberships already use.
      - **Ending signals other sessions.** `sets` joined the realtime
        publication; other open screens navigate themselves to the
        result instead of sitting on a board that silently refuses
        writes.
      - **Ending is the host's.** It never was — `end_match` only
        asked "are you a player", so anyone could end it for
        everyone. Non-hosts now get "Leave match" instead.
      - **Board no longer hides you.** Was `slice(0, 5)` of up to 20;
        now top-of-table plus your own row, always, with expand.
      - Error handling on add/edit/end-route was already in place by
        the time this pass ran.

      Still open: no hand-over if the host wants to leave rather than
      end (pg_cron's `end_stale_matches` is the backstop).

- [x] **Card + Ranks merge.** *(Shipped 2026-08-16. Design session
      first — three structures weighed, see CONTEXT.md.)* Not tabs:
      behind a tab you log a send and nothing says it mattered. The
      Card carries a live rank strip that moves as you log and opens
      the full Chorkboard on tap. Nav down from six entries to five.

      Rejected on the way: one long scrolling page (the board would
      have had to shed the browse controls and scoring key), and
      Card | This set | All time as one flattened control (mixes two
      axes, and you still never see your rank while logging).
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
