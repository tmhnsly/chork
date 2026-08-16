/**
 * `@/lib/env` for Storybook.
 *
 * The real module validates `process.env` at import time and throws on
 * a missing required var. Next inlines `NEXT_PUBLIC_*` statically;
 * Storybook's webpack does not, so every var read as `undefined` and
 * any story whose tree reached this module died on
 * "Invalid or missing environment variables" — the Onboarding page
 * story among them, which is how a change to the first screen every
 * new climber sees went unreviewable.
 *
 * Stubbed rather than fed the real values on purpose. Stories don't
 * make network calls — server actions are already aliased away in
 * `main.ts` for the same reason — so a Storybook build has no use for
 * a Supabase key, and baking one into a static bundle that gets
 * published is worse than useless.
 *
 * The placeholders are deliberately obvious. Anything that renders
 * one has found a real bug: it means a story is displaying a value
 * that should have come from a prop or a mock.
 */
export const env = {
  NEXT_PUBLIC_SITE_URL: "https://storybook.invalid",
  NEXT_PUBLIC_SUPABASE_URL: "https://storybook.invalid",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "storybook-anon-key",
  SITE_URL: "https://storybook.invalid",
  SUPABASE_URL: "https://storybook.invalid",
  SUPABASE_ANON_KEY: "storybook-anon-key",
  SUPABASE_SERVICE_ROLE_KEY: undefined,
  CHORK_COOKIE_SECRET: undefined,
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: undefined,
  VAPID_PRIVATE_KEY: undefined,
  VAPID_SUBJECT: undefined,
  UPSTASH_REDIS_REST_URL: undefined,
  UPSTASH_REDIS_REST_TOKEN: undefined,
  NEXT_PUBLIC_SENTRY_DSN: undefined,
  SENTRY_AUTH_TOKEN: undefined,
  NODE_ENV: "development",
} as const;

/** Optional features are off in Storybook — see the note above. */
export const hasUpstash = false;
export const hasCookieSecret = false;
