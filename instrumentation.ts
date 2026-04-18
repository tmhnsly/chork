/**
 * Next.js instrumentation hook. Runs once per runtime (node + edge)
 * at server start. Sentry requires this file to wire server-side
 * error capture — the client side loads `sentry.client.config.ts`
 * automatically via `withSentryConfig` in `next.config.ts`.
 *
 * Gated on `NEXT_RUNTIME` so each runtime gets only the config it
 * can actually execute:
 *   • `nodejs` → full Node APIs (server actions, API routes)
 *   • `edge`   → fetch-only runtime (middleware's edge portions)
 *
 * Both configs no-op when `NEXT_PUBLIC_SENTRY_DSN` isn't set, so
 * the file is safe to ship without Sentry credentials provisioned.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Sentry expects this export for RSC error capture — forwards any
// React Server Component error to Sentry without wrapping boilerplate.
export { captureRequestError as onRequestError } from "@sentry/nextjs";
