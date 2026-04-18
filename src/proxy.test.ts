import { describe, it, expect } from "vitest";
import { config } from "./proxy";

// Next 16 renamed `middleware.ts` → `proxy.ts` (the file now also
// runs in the Node.js runtime by default instead of the edge). The
// `config.matcher` export shape is unchanged, so this suite keeps
// asserting the same invariants against the renamed module.
describe("proxy config", () => {
  it("covers the home route for session refresh", () => {
    expect(config.matcher).toContain("/");
  });

  it("covers all protected routes", () => {
    const required = ["/login/:path*", "/onboarding/:path*", "/profile/:path*", "/leaderboard/:path*", "/u/:path*"];
    for (const route of required) {
      expect(config.matcher).toContain(route);
    }
  });

  it("covers privacy page for session refresh", () => {
    expect(config.matcher).toContain("/privacy/:path*");
  });
});
