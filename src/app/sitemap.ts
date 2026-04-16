import type { MetadataRoute } from "next";

/**
 * Static sitemap — only the public, logged-out-reachable surface.
 * Climber profile pages at `/u/[username]` are public but dynamic;
 * we don't list them here to avoid a per-request DB query on the
 * sitemap fetch. Add them later via a cached RSC fetch if we start
 * caring about crawler coverage of profiles.
 */
const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://chork.vercel.app";

// Build-time constant — avoids calling `new Date()` inside the
// handler body (react-hooks/purity is strict about side effects
// even outside component render). Cadence is deploy-driven anyway.
const LAST_MODIFIED = new Date().toISOString();

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE}/`, lastModified: LAST_MODIFIED, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE}/login`, lastModified: LAST_MODIFIED, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE}/privacy`, lastModified: LAST_MODIFIED, changeFrequency: "yearly", priority: 0.3 },
  ];
}
