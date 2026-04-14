import type { MetadataRoute } from "next";

/**
 * Static sitemap — only the public, logged-out-reachable surface.
 * Climber profile pages at `/u/[username]` are public but dynamic;
 * we don't list them here to avoid a per-request DB query on the
 * sitemap fetch. Add them later via a cached RSC fetch if we start
 * caring about crawler coverage of profiles.
 */
const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://chork.app";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: `${SITE}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE}/login`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];
}
