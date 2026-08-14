import { describe, it, expect } from "vitest";
import { validateEnv, formatEnvIssues, type RawEnv } from "./env-validate";

/**
 * `env.ts` validates at module load and throws, so the rules were
 * previously untestable — importing the module in a test either
 * succeeded or took the suite down with it. Extracting the rules made
 * them checkable; these are the cases a mis-configured deploy would
 * hit.
 */

const valid: RawEnv = {
  NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "service-key",
  NEXT_PUBLIC_SITE_URL: "https://chork.app",
  NODE_ENV: "production",
};

describe("validateEnv", () => {
  it("accepts a complete server environment", () => {
    const r = validateEnv(valid, true);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.NEXT_PUBLIC_SITE_URL).toBe("https://chork.app");
      expect(r.data.NODE_ENV).toBe("production");
    }
  });

  it("requires the service-role key on the server but not the client", () => {
    // On the client that var is legitimately absent — Next only inlines
    // NEXT_PUBLIC_* into the browser bundle, on purpose. Requiring it
    // everywhere would make `env` throw inside any client component
    // that just wanted to read SITE_URL.
    const withoutKey = { ...valid, SUPABASE_SERVICE_ROLE_KEY: undefined };
    expect(validateEnv(withoutKey, false).ok).toBe(true);

    const onServer = validateEnv(withoutKey, true);
    expect(onServer.ok).toBe(false);
    if (!onServer.ok) {
      expect(onServer.issues.map((i) => i.key)).toContain(
        "SUPABASE_SERVICE_ROLE_KEY",
      );
    }
  });

  it("reports every broken key, not just the first", () => {
    // A deploy with three things wrong should say so once, not make
    // someone fix-and-redeploy three times.
    const r = validateEnv(
      { NEXT_PUBLIC_SUPABASE_URL: "not-a-url", NEXT_PUBLIC_SITE_URL: "also-bad" },
      true,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      const keys = r.issues.map((i) => i.key);
      expect(keys).toContain("NEXT_PUBLIC_SUPABASE_URL");
      expect(keys).toContain("NEXT_PUBLIC_SITE_URL");
      expect(keys).toContain("NEXT_PUBLIC_SUPABASE_ANON_KEY");
      expect(keys).toContain("SUPABASE_SERVICE_ROLE_KEY");
    }
  });

  it("rejects a cookie secret that isn't exactly 64 chars", () => {
    // Wrong length means `getKey` decodes a short/odd hex buffer and
    // signing silently misbehaves rather than failing outright.
    const short = validateEnv({ ...valid, CHORK_COOKIE_SECRET: "abc" }, true);
    expect(short.ok).toBe(false);

    const right = validateEnv({ ...valid, CHORK_COOKIE_SECRET: "a".repeat(64) }, true);
    expect(right.ok).toBe(true);
  });

  it("treats an absent optional var as fine and a malformed one as an error", () => {
    expect(validateEnv({ ...valid, UPSTASH_REDIS_REST_URL: undefined }, true).ok).toBe(true);
    expect(validateEnv({ ...valid, UPSTASH_REDIS_REST_URL: "nope" }, true).ok).toBe(false);
  });

  it("defaults NODE_ENV but rejects an unknown value", () => {
    const missing = validateEnv({ ...valid, NODE_ENV: undefined }, true);
    expect(missing.ok).toBe(true);
    if (missing.ok) expect(missing.data.NODE_ENV).toBe("development");

    expect(validateEnv({ ...valid, NODE_ENV: "staging" }, true).ok).toBe(false);
  });

  it("counts an explicitly empty var as present, and therefore invalid", () => {
    // `FOO=` in a deploy config is a different mistake from not setting
    // FOO at all, and the more confusing one — it should not quietly
    // pass as an empty string.
    expect(validateEnv({ ...valid, NEXT_PUBLIC_SUPABASE_ANON_KEY: "" }, true).ok).toBe(false);
  });

  it("formats issues one per line, naming each key", () => {
    const r = validateEnv({}, true);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      const msg = formatEnvIssues(r.issues);
      expect(msg).toContain("Invalid or missing environment variables:");
      expect(msg).toContain("• NEXT_PUBLIC_SITE_URL: Required");
      expect(msg.split("\n").length).toBeGreaterThan(3);
    }
  });
});
