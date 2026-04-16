import type { NextConfig } from "next";
import path from "path";

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
    optimizePackageImports: ["react-icons/fa6"],
  },
  sassOptions: {
    includePaths: [
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

export default nextConfig;
