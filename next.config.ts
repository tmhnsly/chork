import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  experimental: {
    staleTimes: {
      // Re-use cached server component output for 3 minutes on client nav.
      // Data is still fresh on hard reload / first visit.
      dynamic: 180,
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
