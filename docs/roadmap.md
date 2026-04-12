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
      podium, neighbourhood rows
- [x] Crew feature — mutual groups with private leaderboard and
      activity feed. Replaces follows (migration 020)
- [x] User search + invite flow with block list + rate limit
- [x] Achievements + badges with persistent earned-at
- [x] Competitions (multi-gym) with category filter + organiser role
- [x] PWA push notifications (crew invite, set goes live)

Admin / gym owner:
- [x] Gym admin signup + separate admin role table (`gym_admins`)
- [x] Sets CRUD with grading scale (V / Font / Points-only)
- [x] Routes quick-setup + edit + tag picker
- [x] `pg_cron`-scheduled auto draft → live on start date
- [x] Admin dashboard with 9 widgets (set overview, top routes,
      engagement, flash leaderboard, zone-vs-send, grade distribution,
      setter breakdown, all-time, competition venue stats)
- [x] This-set / all-time view toggle
- [x] Admin invites with token + expiry + email-address gate

Platform hardening:
- [x] Every RPC with `SECURITY DEFINER`, `search_path=''`,
      explicit grants
- [x] Every RLS policy wraps `auth.uid()` in `(select …)`
- [x] FK indexes on every column used in RLS filters
- [x] Middleware onboarded cookie — skips per-request Supabase check
- [x] Cached `getServerUser` / `getServerProfile` React cache helpers

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

- [ ] Rate limiting on server actions (Vercel WAF or edge
      middleware with sliding window)
- [ ] Error monitoring (Sentry or similar)
- [ ] Database connection pooling (Supabase config verify)
- [ ] Scheduled backups verified restorable

## Next up

- [ ] Closing-event UI (data model in place — `closing_event` +
      `venue_gym_id` on sets)
- [ ] Invite email delivery for `gym_invites` (current flow
      produces a link; email plumbing ships with the SMTP task above)
- [ ] Avatar uploads via Supabase Storage
- [ ] Route QR codes (scan to open route-log sheet)
- [ ] Comment threading UI (`parent_id` exists in schema)

## Planned

- [ ] Kudos / reactions on activity events
- [ ] Grade pyramids on profiles
- [ ] Gym subscription billing (Stripe wired into `plan_tier`)
- [ ] Competition event management UI (rounds, qualifiers, finals)
- [ ] Climber-facing streaks and personal records
- [ ] Setter-facing analytics (engagement per author across sets)
