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
    return [
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
      // Cache server component output for 5 minutes on client navigation.
      // The user's own mutations (complete, uncomplete) call revalidatePath
      // which busts this cache immediately — so their data is always fresh.
      // This only affects how quickly *other users'* changes appear, which
      // isn't time-critical. Reduces Supabase load significantly.
      dynamic: 300,
    },
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
        protocol: "https",
        hostname: "api.dicebear.com",
      },
    ],
  },
};

export default nextConfig;
