import { describe, it, expect } from "vitest";
import { profileCacheUnchanged } from "./auth-context";
import type { Profile } from "./data/types";

/**
 * Regression guard for an infinite render loop in `AuthProvider`.
 *
 * The cache write stamps a fresh `cachedAt` and always dispatches, so
 * every call produced a different raw string. The store memoises on
 * that raw string, so the miss produced a new snapshot object,
 * `useSyncExternalStore` notified, `AuthProvider` re-rendered, and
 * `profile` came back from `JSON.parse` with a new object identity —
 * which the persist effect read as a change and wrote again.
 *
 * It ran on every page load until React bailed out with "Maximum
 * update depth exceeded". Nothing crashed; it just burned renders and
 * logged into a console nobody was reading.
 *
 * These pin the guard that stops it: identical content must compare
 * equal even though the objects never do.
 */

const base = {
  id: "u1",
  username: "tom",
  name: "Tom",
  avatar_url: "",
  onboarded: true,
  active_gym_id: "g1",
  theme: "default",
} as unknown as Profile;

describe("profileCacheUnchanged", () => {
  it("treats a fresh object with identical content as unchanged", () => {
    // This is the exact shape the loop had: same data, new identity
    // every render because it came back through JSON.parse.
    const cached = { profile: base, isAdmin: false, cachedAt: 1 };
    const reparsed = JSON.parse(JSON.stringify(base)) as Profile;
    expect(reparsed).not.toBe(base);
    expect(profileCacheUnchanged(cached, reparsed, false)).toBe(true);
  });

  it("ignores cachedAt — it is bookkeeping, not content", () => {
    expect(
      profileCacheUnchanged({ profile: base, isAdmin: false, cachedAt: 999 }, base, false),
    ).toBe(true);
  });

  it("detects a changed field", () => {
    const cached = { profile: base, isAdmin: false, cachedAt: 1 };
    const renamed = { ...base, name: "Thomas" } as Profile;
    expect(profileCacheUnchanged(cached, renamed, false)).toBe(false);
  });

  it("detects a changed admin flag", () => {
    const cached = { profile: base, isAdmin: false, cachedAt: 1 };
    expect(profileCacheUnchanged(cached, base, true)).toBe(false);
  });

  it("handles sign-out in both directions", () => {
    // Already cleared → nothing to do.
    expect(profileCacheUnchanged(null, null, false)).toBe(true);
    // Signing out with a populated cache → must write the clear.
    expect(
      profileCacheUnchanged({ profile: base, isAdmin: false, cachedAt: 1 }, null, false),
    ).toBe(false);
    // Signing in from empty → must write.
    expect(profileCacheUnchanged(null, base, false)).toBe(false);
  });
});
