import type { NextConfig } from "next";
import path from "path";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // `/index` is Pages-Router-era shorthand that Next keeps responding
  // to out of habit — it serves the home page with no nav highlight
  // and no middleware redirect. We only expose `/` as the home route;
  // redirect any stale deep-links so they can't leak an orphan copy
  // of the dashboard.
  async redirects() {
    return [
      { source: "/index",       destination: "/", permanent: true },
      { source: "/index.html",  destination: "/", permanent: true },
      // Canonicalise on chork.app. Any hit to the Vercel preview
      // hostname (chork.vercel.app, the default `*.vercel.app` alias)
      // lands the user on the branded domain instead — single source
      // of truth for SEO, cookies, and user mental model. Preserves
      // path + query via the `:path*` capture so deep links keep
      // working.
      {
        source: "/:path*",
        has: [{ type: "host", value: "chork.vercel.app" }],
        destination: "https://chork.app/:path*",
        permanent: true,
      },
    ];
  },

  /*
   * Long-lived cache on static icons so the browser fetches them once
   * per deploy. Next.js already serves its hashed `src/app/icon.svg`
   * with `immutable` caching in prod, but the public-dir notification
   * icon referenced by the service worker needs explicit headers —
   * otherwise browsers treat it as a normal static file with no
   * cache directive and re-validate on every page load.
   */
  async headers() {
    // Baseline security headers applied to every response. CSP is
    // deliberately omitted — Next's inline-script hashing + our
    // Supabase + DiceBear origins would need a proper nonce-based
    // CSP generated in middleware, which is a separate project.
    const securityHeaders = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      // SAMEORIGIN rather than DENY — some PWA install / A2HS
      // flows on Android render the page inside an OS-owned frame
      // and DENY has been observed to break install on those paths.
      // We never iframe ourselves, so SAMEORIGIN is effectively DENY
      // for any attacker origin.
      { key: "X-Frame-Options", value: "SAMEORIGIN" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
      },
      {
        key: "Strict-Transport-Security",
        value: "max-age=63072000; includeSubDomains; preload",
      },
    ];
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        source: "/notification-icon.svg",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=604800, stale-while-revalidate=86400",
          },
        ],
      },
      {
        source: "/manifest.json",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, stale-while-revalidate=604800",
          },
        ],
      },
    ];
  },

  experimental: {
    // NOTE: Partial Prerendering (`ppr: "incremental"`) was trialled
    // for `/u/[username]` but the stable 15.x line reserves the
    // feature for canary only (errors out at build time). Revisit
    // when PPR graduates to stable in a point release we're
    // comfortable bumping to. The page is already structured for
    // PPR (static shell + Suspense-streamed sections), so the
    // switch-on is a two-line change when the upstream is ready.
    staleTimes: {
      // Client router cache TTL. With Phase 3 mutations now revalidating
      // precise tags instead of scorching the whole layout, 60s is a
      // better balance — covers normal "tap-back" navigation within an
      // active session, short enough that other users' updates appear
      // without a hard refresh.
      dynamic: 60,
    },
    // react-icons/fa6 is a barrel re-exporting hundreds of components.
    // Default tree-shaking still pulls the barrel module's runtime
    // overhead into client bundles even when only one icon is used.
    // optimizePackageImports tells Next to rewrite imports as if each
    // icon came from its own subpath at build time. ~50 files import
    // from this barrel; this is the supported low-touch fix.
    //
    // date-fns is the same shape — `import { format, parseISO } from
    // "date-fns"` drags the barrel. Every locale file is internally
    // referenced by the barrel's default export too; without this
    // hint the en-US locale bundle ships on every page that touches
    // `format()`. The rewrite keeps bundle weight down to the two
    // or three helpers we actually call.
    optimizePackageImports: ["react-icons/fa6", "date-fns"],
  },
  sassOptions: {
    // Dart sass 1.80+ renamed `includePaths` → `loadPaths`. Next 16
    // pipes the option through unchanged, so the rename has to
    // happen here for `@use "mixins/..."` imports to resolve
    // against `src/styles` without a relative path.
    loadPaths: [
      path.join(process.cwd(), "node_modules"),
      path.join(process.cwd(), "src/styles"),
    ],
  },
  images: {
    remotePatterns: [
      {
        // Uploaded climber avatars (Supabase Storage). Without this
        // entry the optimizer would refuse the URL and Next would
        // fall back to unoptimized — defeating the size shrink.
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

// Sentry wrapper. Activates only when SENTRY_AUTH_TOKEN is set at
// build time (source-map upload needs it). Missing token = plugin
// is a no-op; runtime init is still gated on NEXT_PUBLIC_SENTRY_DSN
// inside the sentry.*.config.ts files, so every layer degrades
// gracefully without Sentry credentials.
export default withSentryConfig(nextConfig, {
  // Disable the integration entirely when no auth token is present.
  // Prevents a dev build from talking to Sentry's API.
  silent: !process.env.SENTRY_AUTH_TOKEN,
  // Keep source maps out of the browser bundle (upload-only).
  widenClientFileUpload: true,
  // Skip the telemetry ping that runs on every build.
  telemetry: false,
});
