import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  experimental: {
    staleTimes: {
      // Always re-fetch dynamic pages on client navigation.
      // This app has real-time scoring — stale data breaks UX.
      dynamic: 0,
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
        hostname: "chork.pockethost.io",
        pathname: "/api/files/**",
      },
    ],
  },
};

export default nextConfig;
