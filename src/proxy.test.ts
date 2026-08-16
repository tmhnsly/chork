import { describe, it, expect } from "vitest";
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { config } from "./proxy";

/**
 * Every app route has to be listed in the proxy's matcher.
 *
 * The matcher is an explicit allow-list, which means a new route is
 * silently *un*-proxied rather than loudly broken — and what it loses
 * is quiet: the `chork-auth-shell` cookie never gets stamped, so
 * `NavBarShell` server-renders the signed-out nav on that route and
 * the entire authed nav pops in on hydration. It shipped that way on
 * /friends within an hour of the route existing.
 *
 * Public routes are exempt because they genuinely don't need the
 * proxy — but they're named here rather than pattern-matched, so
 * adding one is a decision rather than an omission.
 */

const APP = join(process.cwd(), "src/app");

/** Routes that intentionally sit outside the matcher. */
const EXEMPT = new Set([
  "/", // listed as a bare "/" rather than a :path* pattern
  "/r", // public share card — no nav, no session needed
  "/auth", // Supabase callback handlers
]);

/** Turn `src/app/(app)/crew/[id]/page.tsx` into `/crew`. */
function routeSegments(dir: string, prefix = ""): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (!statSync(path).isDirectory()) continue;
    // Route groups `(app)` and private folders `_components` add no
    // URL segment.
    if (entry.startsWith("_")) continue;
    const segment = entry.startsWith("(") ? prefix : `${prefix}/${entry}`;
    if (!entry.startsWith("(") && !entry.startsWith("[") && prefix === "") {
      out.push(`/${entry}`);
    }
    out.push(...routeSegments(path, segment));
  }
  return out;
}

describe("proxy matcher", () => {
  it("covers every top-level app route", () => {
    const topLevel = [...new Set(routeSegments(APP))]
      .filter((r) => r.split("/").length === 2)
      .filter((r) => !EXEMPT.has(r));

    const matched = new Set(
      config.matcher.map((m) => `/${m.split("/")[1]}`.replace(/:path\*$/, "")),
    );

    const missing = topLevel.filter((r) => !matched.has(r));
    expect(
      missing,
      "Add these to config.matcher in src/proxy.ts, or to EXEMPT here "
        + "if they genuinely need no session — an unmatched route "
        + "server-renders the signed-out nav and flashes on hydration",
    ).toEqual([]);
  });
});
