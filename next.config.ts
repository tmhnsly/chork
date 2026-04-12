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
