import { z } from "zod";

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
 *    `.optional()` here, and callers check for presence before wiring
 *    the feature in.
 *
 * Usage: `import { env } from "@/lib/env"` and read `env.SITE_URL` etc.
 * Never reach into `process.env` directly — if it's not in this schema,
 * add it here first so the type surface stays documented.
 */
// When this module loads in the browser, non-NEXT_PUBLIC_ env vars
// are correctly `undefined` — Next only inlines NEXT_PUBLIC_* vars
// into the client bundle for safety (SUPABASE_SERVICE_ROLE_KEY would
// otherwise leak to every visitor). The schema must therefore
// require those server-only keys *only* when running on the server,
// otherwise the `env` module throws in a client component that just
// wanted to read `env.SITE_URL`.
const isServer = typeof window === "undefined";

const schema = z.object({
  // Required — the app cannot start without these
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  // Server-only secret. On the client it's legitimately absent (and
  // any code that tries to read it from the client is a bug elsewhere
  // — `createServiceClient` has its own `import "server-only"` guard).
  SUPABASE_SERVICE_ROLE_KEY: isServer
    ? z.string().min(1)
    : z.string().optional(),
  NEXT_PUBLIC_SITE_URL: z.string().url(),

  // Optional — feature-gated. Each consumer checks for presence.
  // Required to enable signed middleware cookies. 32 bytes hex = 64
  // chars. Generate with `openssl rand -hex 32`. When unset the
  // middleware falls back to unsigned cookies (same as before signing
  // was introduced) so local dev doesn't need to set this to boot.
  CHORK_COOKIE_SECRET: z.string().length(64).optional(),
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().optional(),
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
  NEXT_PUBLIC_SENTRY_DSN: z.string().url().optional(),
  SENTRY_AUTH_TOKEN: z.string().optional(),

  // Set by the Next/Node runtime — typed for completeness so
  // consumers have a documented way to branch on dev vs prod.
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

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

const parsed = schema.safeParse(raw);

if (!parsed.success) {
  // Fail in a shape that's legible in build logs: one line per broken
  // key with the validation message. Better than Zod's default
  // stringify which buries the signal in a nested tree.
  const issues = parsed.error.issues
    .map((i) => `  • ${i.path.join(".")}: ${i.message}`)
    .join("\n");
  throw new Error(
    `Invalid or missing environment variables:\n${issues}\n` +
      "See src/lib/env.ts for the full schema.",
  );
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
 * True when VAPID keys are configured. Push helpers short-circuit
 * when false — push is best-effort and graceful-no-op is fine.
 */
export const hasVapid =
  !!validated.NEXT_PUBLIC_VAPID_PUBLIC_KEY && !!validated.VAPID_PRIVATE_KEY;

/**
 * True when Sentry is configured. If you add a new Sentry feature
 * that should no-op without keys, gate it on this.
 */
export const hasSentry = !!validated.NEXT_PUBLIC_SENTRY_DSN;

/**
 * True when the cookie-signing secret is set. When false, the
 * `sign`/`verify` helpers in `cookie-sign.ts` fall through (sign =
 * pass-through, verify = accept-as-is) so dev flows don't require
 * a secret to function.
 */
export const hasCookieSecret = !!validated.CHORK_COOKIE_SECRET;
