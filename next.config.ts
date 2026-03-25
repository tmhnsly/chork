import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  sassOptions: {
    includePaths: [
      path.join(process.cwd(), "node_modules"),
      path.join(process.cwd(), "src/app/styles"),
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
