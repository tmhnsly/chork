/**
 * Sentry server config. Runs in the Node runtime (server components,
 * server actions, API routes, middleware's Node portions).
 */
import * as Sentry from "@sentry/nextjs";

if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0.1,
    sendDefaultPii: false,

    beforeSend(event) {
      if (event.user) {
        event.user = { id: event.user.id };
      }
      // Strip Supabase connection strings / keys from exception
      // messages if they ever sneak in via a stringified error.
      if (event.exception?.values) {
        for (const ex of event.exception.values) {
          if (ex.value) {
            ex.value = ex.value
              .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[jwt]")
              .replace(/sk_[a-z]+_[A-Za-z0-9]+/g, "[service-key]");
          }
        }
      }
      return event;
    },
  });
}
