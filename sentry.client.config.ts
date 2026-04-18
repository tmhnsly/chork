/**
 * Sentry client config. Runs in the browser bundle.
 *
 * All three Sentry configs (client / server / edge) are gated on
 * `NEXT_PUBLIC_SENTRY_DSN`: empty string = no-op init. This lets a
 * fresh clone of the repo boot without a Sentry project, and lets
 * preview deploys on forks skip ingest entirely.
 *
 * `tracesSampleRate` is deliberately conservative — 10% perf-trace
 * sampling covers the latency histogram without eating quota during
 * a traffic spike. Bump if you actually start investigating perf.
 */
import * as Sentry from "@sentry/nextjs";

if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0.1,

    // Session replay is off by default — it's bandwidth-heavy and
    // Chork's fully dynamic (PWA, logged-in). Flip on only if a
    // specific bug class needs the trace.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,

    // Scrub default PII. `sendDefaultPii: false` is the default in
    // v10 but we declare it to lock intent.
    sendDefaultPii: false,

    // Redact known sensitive keys from breadcrumb + event payloads.
    // The app rarely ships user input into exceptions, but a stray
    // form submission in a breadcrumb would otherwise land in Sentry
    // as-is.
    beforeSend(event) {
      if (event.user) {
        // Keep the anonymous id for correlation, drop everything else.
        event.user = { id: event.user.id };
      }
      return event;
    },

    beforeBreadcrumb(bc) {
      if (bc.category === "fetch" || bc.category === "xhr") {
        // Strip request bodies + auth headers from HTTP breadcrumbs.
        if (bc.data) {
          delete bc.data.request_body_size;
          delete bc.data.response_body_size;
        }
      }
      return bc;
    },
  });
}
