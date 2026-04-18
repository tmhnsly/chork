/**
 * Sentry edge config. Runs in the Vercel Edge runtime (the portion
 * of Next's middleware that runs at the edge). Thinner API surface
 * — no filesystem, no Node crypto, limited to fetch-based globals.
 */
import * as Sentry from "@sentry/nextjs";

if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
  });
}
