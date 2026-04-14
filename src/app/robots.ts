import type { MetadataRoute } from "next";

/**
 * Chork is a logged-in app; public surface is only the landing +
 * marketing routes. Everything behind auth (logging, leaderboard,
 * admin, crews, competitions) would 401 a crawler anyway — explicit
 * here so bots don't waste crawl budget and so we don't have to
 * rely on the 401 wall as our SEO boundary.
 */
const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://chork.app";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/how-it-works", "/u/"],
        disallow: [
          "/admin",
          "/admin/",
          "/api/",
          "/auth/",
          "/onboarding",
          "/settings",
          "/inbox",
          "/crew",
          "/competitions",
          "/log",
          "/leaderboard",
        ],
      },
    ],
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  };
}
