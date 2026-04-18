import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Rate-limit env is controlled per test — clear before each so the
// module re-evaluates `hasUpstash`.
const ORIG_URL = process.env.UPSTASH_REDIS_REST_URL;
const ORIG_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

beforeEach(() => {
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  vi.resetModules();
});

afterEach(() => {
  if (ORIG_URL) process.env.UPSTASH_REDIS_REST_URL = ORIG_URL;
  if (ORIG_TOKEN) process.env.UPSTASH_REDIS_REST_TOKEN = ORIG_TOKEN;
});

describe("enforce (Upstash unconfigured)", () => {
  it("returns ok:true without contacting Redis when env is missing", async () => {
    // With no UPSTASH_* vars set, enforce must be a no-op. This
    // lets `pnpm dev` + CI boot without Redis — rate limiting is
    // a belt-and-braces layer, not the first line of defence.
    const { enforce } = await import("./rate-limit");
    expect(await enforce("mutationsWrite", "user-a")).toEqual({ ok: true });
    expect(await enforce("invitesSend", "user-a")).toEqual({ ok: true });
    expect(await enforce("pushSubscribe", "user-a")).toEqual({ ok: true });
  });
});

describe("enforce (Upstash configured, Redis throws)", () => {
  it("fails open when Redis is unreachable", async () => {
    // Real scenario: Upstash is configured but Redis had a blip.
    // We fail-open so a mutation doesn't 500 just because a rate
    // check couldn't reach its backing store. Auth + RLS still
    // gate the underlying write.
    process.env.UPSTASH_REDIS_REST_URL = "https://example.invalid";
    process.env.UPSTASH_REDIS_REST_TOKEN = "invalid-token";
    vi.resetModules();

    // Mock @upstash/ratelimit so `lim.limit(...)` rejects — we can't
    // rely on a real network failure inside the test sandbox.
    vi.doMock("@upstash/ratelimit", () => ({
      Ratelimit: class {
        static slidingWindow() {
          return {};
        }
        constructor() {}
        async limit() {
          throw new Error("redis offline");
        }
      },
    }));
    vi.doMock("@upstash/redis", () => ({
      Redis: class {
        constructor() {}
      },
    }));

    const { enforce } = await import("./rate-limit");
    expect(await enforce("mutationsWrite", "user-a")).toEqual({ ok: true });
  });
});
