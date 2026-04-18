import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Set the secret BEFORE importing the module so env.ts's module-load
// schema parse sees it. 64 hex chars = the required shape from env.ts.
const TEST_SECRET = "a".repeat(64);
const ORIGINAL = process.env.CHORK_COOKIE_SECRET;

beforeEach(() => {
  process.env.CHORK_COOKIE_SECRET = TEST_SECRET;
  vi.resetModules();
});
afterEach(() => {
  process.env.CHORK_COOKIE_SECRET = ORIGINAL;
});

describe("sign / verify (with secret)", () => {
  it("round-trips a simple value", async () => {
    const { sign, verify } = await import("./cookie-sign");
    const signed = await sign("user-abc:1");
    expect(signed).toContain("user-abc:1.");
    expect(await verify(signed)).toBe("user-abc:1");
  });

  it("rejects a tampered payload", async () => {
    const { sign, verify } = await import("./cookie-sign");
    const signed = await sign("user-abc:1");
    // Flip one byte of the payload — signature no longer matches.
    const tampered = signed.replace("user-abc", "user-xyz");
    expect(await verify(tampered)).toBeNull();
  });

  it("rejects a missing signature", async () => {
    const { verify } = await import("./cookie-sign");
    // A bare value with no .sig suffix is rejected when a secret
    // is configured — this is the "attacker set the cookie from
    // DevTools" scenario.
    expect(await verify("user-abc:1")).toBeNull();
  });

  it("rejects a truncated signature", async () => {
    const { sign, verify } = await import("./cookie-sign");
    const signed = await sign("user-abc:1");
    const truncated = signed.slice(0, -5);
    expect(await verify(truncated)).toBeNull();
  });

  it("returns null for undefined input", async () => {
    const { verify } = await import("./cookie-sign");
    expect(await verify(undefined)).toBeNull();
  });
});

describe("sign / verify (no secret)", () => {
  it("passes values through unchanged when no secret is configured", async () => {
    delete process.env.CHORK_COOKIE_SECRET;
    vi.resetModules();
    const { sign, verify } = await import("./cookie-sign");
    // Dev-path: sign is a no-op, verify accepts as-is. Preserves
    // the pre-signing behaviour so `pnpm dev` without the env
    // var still boots.
    expect(await sign("user-abc:1")).toBe("user-abc:1");
    expect(await verify("user-abc:1")).toBe("user-abc:1");
    expect(await verify(undefined)).toBeNull();
  });
});
