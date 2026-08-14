import { validateEnv, formatEnvIssues } from "./env-validate";

/**
 * Typed, runtime-validated env schema.
 *
 * Two design goals:
 *
 * 1. **Fail loudly on a missing required var.** Previously every
 *    caller had its own `process.env.NEXT_PUBLIC_SITE_URL ?? "https://…"`
 *    fallback string — five copies, any one of which could drift if the
 *    domain moved. Now missing required vars throw at module load, so
 *    a mis-configured deploy fails the build instead of silently
 *    shipping broken invite links or CORS-rejected redirects.
 *
 * 2. **Gate optional features cleanly.** Push, rate-limiting, and
 *    observability are all opt-in — a fresh clone of the repo should
 *    boot without Upstash / Sentry / VAPID keys. Those vars are
 *    optional here, and callers check for presence before wiring
 *    the feature in.
 *
 * Usage: `import { env } from "@/lib/env"` and read `env.SITE_URL` etc.
 * Never reach into `process.env` directly — if it's not in this schema,
 * add it here first so the type surface stays documented.
 *
 * The rules live in `env-validate.ts` as a pure function. This module
 * is reachable from client code (`auth-context.tsx` reads
 * `env.SITE_URL`), so whatever it imports ships to the browser — which
 * is why the validation is hand-rolled rather than a schema library.
 */
// When this module loads in the browser, non-NEXT_PUBLIC_ env vars
// are correctly `undefined` — Next only inlines NEXT_PUBLIC_* vars
// into the client bundle for safety (SUPABASE_SERVICE_ROLE_KEY would
// otherwise leak to every visitor). The schema must therefore
// require those server-only keys *only* when running on the server,
// otherwise the `env` module throws in a client component that just
// wanted to read `env.SITE_URL`.
const isServer = typeof window === "undefined";

// We explicitly read each key via `process.env.<NAME>` (rather than
// `process.env`) so Next's static replacement works for every
// `NEXT_PUBLIC_*` var at build time. Without the per-key read, the
// client bundle wouldn't inline them.
const raw = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  CHORK_COOKIE_SECRET: process.env.CHORK_COOKIE_SECRET,
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY,
  VAPID_SUBJECT: process.env.VAPID_SUBJECT,
  UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
  UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
  NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
  SENTRY_AUTH_TOKEN: process.env.SENTRY_AUTH_TOKEN,
  NODE_ENV: process.env.NODE_ENV,
};

const parsed = validateEnv(raw, isServer);

if (!parsed.ok) {
  // Fail in a shape that's legible in build logs: one line per broken
  // key with the validation message.
  throw new Error(formatEnvIssues(parsed.issues));
}

const validated = parsed.data;

/**
 * Validated, typed env. Import this instead of reading `process.env`
 * directly. The shorthand aliases below match the most-used keys so
 * callers don't have to say `env.NEXT_PUBLIC_SITE_URL` everywhere.
 */
export const env = {
  ...validated,
  SITE_URL: validated.NEXT_PUBLIC_SITE_URL,
  SUPABASE_URL: validated.NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_ANON_KEY: validated.NEXT_PUBLIC_SUPABASE_ANON_KEY,
} as const;

/**
 * True when Upstash credentials are present. Rate-limit wrappers
 * fall back to a no-op allow-all when false, so local dev / test
 * don't need Redis to boot.
 */
export const hasUpstash =
  !!validated.UPSTASH_REDIS_REST_URL && !!validated.UPSTASH_REDIS_REST_TOKEN;

/**
 * True when the cookie-signing secret is set. When false, the
 * `sign`/`verify` helpers in `cookie-sign.ts` fall through (sign =
 * pass-through, verify = accept-as-is) so dev flows don't require
 * a secret to function.
 */
export const hasCookieSecret = !!validated.CHORK_COOKIE_SECRET;
