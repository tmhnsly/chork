# Chork

Multi-gym bouldering competition tracker PWA. Climbers log attempts
on numbered routes within a gym's active competition set, earn points
on a public gym leaderboard ("Chorkboard"), and compete inside
private groups called **crews**.

Live at https://chork.vercel.app (once a domain lands, this'll update).

---

## Stack

- Next.js 15 App Router (Turbopack)
- Supabase (Auth, Postgres, RLS, RPCs, `pg_cron`)
- SCSS modules + a design-token system
- TypeScript strict, Vitest for tests

---

## Getting started

```bash
pnpm install
cp .env.example .env.local   # fill in Supabase URL + keys
pnpm dev
```

Open http://localhost:3000.

If you're linked to a Supabase project:

```bash
pnpm exec supabase db push                        # apply pending migrations
pnpm exec supabase gen types typescript \
  --project-id <id> > src/lib/database.types.ts   # regenerate types
```

---

## Useful commands

| Command | Purpose |
|---|---|
| `pnpm dev` | Dev server |
| `pnpm build` | Production build (CI equivalent) |
| `pnpm test --run` | Vitest one-shot |
| `pnpm test` | Vitest watch mode |
| `pnpm next lint` | Next.js lint (CI-blocking) |
| `pnpm storybook` | Storybook on :6006 |

---

## Documentation

All docs live in `docs/`:

- **[`CLAUDE.md`](./CLAUDE.md)** — orientation for contributors (and
  the Claude agent that works on this codebase). Start here
- **[`docs/architecture.md`](./docs/architecture.md)** — auth flow,
  data access layer, multi-tenancy, crew model, push pipeline
- **[`docs/schema.md`](./docs/schema.md)** — Supabase tables, RPC
  catalogue, RLS summary
- **[`docs/migrations.md`](./docs/migrations.md)** — one-line-per-file
  migration history (001 → current)
- **[`docs/testing.md`](./docs/testing.md)** — test patterns,
  mocking strategy, what to test vs skip
- **[`docs/db-audit.md`](./docs/db-audit.md)** — DB hardening
  findings from the last audit pass
- **[`docs/roadmap.md`](./docs/roadmap.md)** — shipped / next / planned

---

## Project shape

```
src/
├── app/                # Next.js App Router
│   ├── (app)/         # Authenticated climber routes
│   ├── admin/         # Gym admin + organiser surface
│   ├── auth/          # Supabase callback
│   ├── competitions/  # Climber-facing comp pages
│   ├── crew/          # Crew tab
│   ├── leaderboard/   # Chorkboard
│   ├── login/
│   ├── onboarding/
│   ├── privacy/
│   ├── profile/
│   ├── u/[username]/
│   ├── layout.tsx
│   └── page.tsx       # Wall / landing
├── components/        # React components (Storybook sits next door)
├── lib/
│   ├── auth.ts        # requireAuth / requireSignedIn / requireGymAdmin
│   ├── auth-context.tsx
│   ├── data/          # Queries, mutations, pure logic
│   ├── offline/       # IndexedDB mutation queue
│   ├── push/          # web-push server + client helpers
│   └── supabase/      # Browser + server + middleware clients
├── middleware.ts
├── styles/            # Design tokens + mixins
└── test/              # Mock factories shared by tests + stories

supabase/migrations/   # 001_initial_schema.sql → current
```

---

## Deployment

Vercel. Push to `main` → auto-deploys. Preview deploys on PRs.

Before shipping migrations, always:

1. `pnpm test --run` green
2. `pnpm next lint` clean
3. `pnpm build` succeeds locally
4. `pnpm exec supabase db push` applied (production DB is the source
   of truth — we don't maintain multiple environments)
5. Regenerate types
6. Commit + push
