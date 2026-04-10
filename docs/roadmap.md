# Chork Roadmap

## Current (shipped)

- Punch card: log attempts, complete routes, flash tracking
- Points system: flash=4, 2 attempts=3, 3 attempts=2, 4+=1, zone=+1
- Beta spray: comments on routes, likes, blur for uncompleted users
- Community grades: average of grade votes
- User profiles: stats, mini punch card, activity feed
- Multi-gym: gym selection during onboarding, gym-scoped data
- RLS: row-level security on every table
- PWA: manifest, standalone mode, viewport config
- Auth: email+password via Supabase

## Pre-launch (before going public)

- [ ] Buy domain (chork.app or similar)
- [ ] Verify domain in Resend → add DNS records in Cloudflare
- [ ] Configure Supabase SMTP with Resend (host: smtp.resend.com, port: 465, sender: noreply@chork.app)
- [ ] Set up Cloudflare email forwarding (hi@chork.app → personal email)
- [ ] Enable "Confirm email" in Supabase Auth
- [ ] Update Supabase redirect URLs for production domain
- [ ] Branded email templates already built (just need sender domain)
- [ ] Auth callback route already built at /auth/callback
- [ ] Google OAuth (add back)
- [ ] Apple Sign In

## Next up

- [ ] Leaderboard: ranked by points per set, per gym
- [ ] Avatar uploads via Supabase Storage
- [ ] Gym admin dashboard: manage sets, routes, members
- [ ] Route QR codes: scan to open the route log sheet

## Planned

- [ ] Social activity feed: see what your gym is sending
- [ ] Follow users: follow/unfollow, followers/following counts
- [ ] Kudos: react to activity events
- [ ] Crews: friend groups with their own leaderboard
- [ ] Crew memberships: invite/join/leave
- [ ] Achievements and badges
- [ ] Grade pyramids on profiles
- [ ] Gym analytics: completion rates, popular routes, grade distribution
- [ ] Competition event management: timed comps, qualifiers, finals
- [ ] Gym subscription billing (for gym owners)
- [ ] Comment threading (parent_id exists in schema, UI not built)
- [ ] Offline mode: service worker caching, mutation queue
