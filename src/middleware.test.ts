import { describe, it, expect } from "vitest";
import { config } from "./middleware";

describe("middleware config", () => {
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
