import { describe, it, expect } from "vitest";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
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

/** Turn `src/app/(app)/friends/[id]/page.tsx` into `/friends`. */
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

// ────────────────────────────────────────────────────────────────
// proxy() — the function itself
// ────────────────────────────────────────────────────────────────
//
// 195 lines on every page nav, and until 2026-08-30 the only test on
// this file never called it. Three production incidents are written
// into its comments; each is pinned below so the comment can't drift
// from the code: a dead session that took every request down
// ("Invalid Refresh Token" on every nav), `/login-wall-of-shame`
// treated as the login page, and the onboarded cookie that skipped
// the profile read for the wrong user.
//
// `createMiddlewareSupabase` and the cookie signer are doubled; the
// signer as a visible prefix so a test can assert both "signed" and
// "not signed". Everything else is the real proxy.

import { vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { createMockSupabase } from "@/test/mock-supabase";

vi.mock("@/lib/supabase/middleware", () => ({ createMiddlewareSupabase: vi.fn() }));
vi.mock("@/lib/cookie-sign", () => ({
  sign: vi.fn(async (value: string) => `signed:${value}`),
  verify: vi.fn(async (value?: string) =>
    value?.startsWith("signed:") ? value.slice("signed:".length) : null,
  ),
}));

const UID = "11111111-1111-4111-8111-111111111111";

type Primed = Parameters<typeof createMockSupabase>[0];

/** Wire a supabase double behind `createMiddlewareSupabase`. */
async function primeMiddleware(
  user: { id: string } | null | { throws: unknown },
  primed: Primed = {},
) {
  const sb = createMockSupabase(primed);
  if (user && "throws" in user) {
    sb.auth.getUser.mockRejectedValue(user.throws);
  } else {
    sb.auth.getUser.mockResolvedValue({ data: { user }, error: null });
  }
  const { createMiddlewareSupabase } = await import("@/lib/supabase/middleware");
  vi.mocked(createMiddlewareSupabase).mockImplementation(() => ({
    supabase: sb as never,
    response: NextResponse.next(),
  }));
  return sb;
}

function request(path: string, cookies: Record<string, string> = {}) {
  const cookie = Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
  return new NextRequest(`https://chork.test${path}`, {
    headers: cookie ? { cookie } : {},
  });
}

function redirectedTo(res: Response): URL | null {
  const location = res.headers.get("location");
  return location ? new URL(location) : null;
}

/** Cookies the response SETS (including deletions, which set an empty value). */
function setCookies(res: NextResponse): Record<string, string> {
  return Object.fromEntries(res.cookies.getAll().map((c) => [c.name, c.value]));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("proxy: signed-out visitors", () => {
  it("skips auth entirely on auth-agnostic routes", async () => {
    const { proxy } = await import("./proxy");
    const { createMiddlewareSupabase } = await import("@/lib/supabase/middleware");
    const res = await proxy(request("/privacy"));
    expect(redirectedTo(res)).toBeNull();
    expect(createMiddlewareSupabase).not.toHaveBeenCalled();
  });

  it("sends a protected route to /login, carrying the destination in ?next=", async () => {
    await primeMiddleware(null);
    const { proxy } = await import("./proxy");
    const res = await proxy(request("/friends?tab=board"));
    const to = redirectedTo(res);
    expect(to?.pathname).toBe("/login");
    expect(to?.searchParams.get("next")).toBe("/friends?tab=board");
  });

  it("lets public routes and their sub-paths through", async () => {
    await primeMiddleware(null);
    const { proxy } = await import("./proxy");
    expect(redirectedTo(await proxy(request("/gyms/yonder")))).toBeNull();
    expect(redirectedTo(await proxy(request("/")))).toBeNull();
    expect(redirectedTo(await proxy(request("/login")))).toBeNull();
  });

  it("does NOT treat /login-wall-of-shame as the login page (prefix bug)", async () => {
    // Plain `startsWith("/login")` once matched any path that began
    // with the word, which let unauthed visitors skip the public-route
    // fallback and bounced authed users off unrelated pages.
    await primeMiddleware(null);
    const { proxy } = await import("./proxy");
    expect(redirectedTo(await proxy(request("/login-wall-of-shame")))?.pathname).toBe("/login");
  });
});

describe("proxy: a session the auth layer rejects", () => {
  it("bins the session cookies when getUser throws a 401, and lands on /login", async () => {
    // A deleted account, from the browser that was signed into it:
    // `getUser()` THROWS on every nav, and without this the middleware
    // took down every request the matcher touched.
    await primeMiddleware({ throws: { status: 401, message: "Invalid Refresh Token: Refresh Token Not Found" } });
    const { proxy } = await import("./proxy");
    const res = await proxy(
      request("/friends", {
        "sb-abcd-auth-token.0": "x",
        "sb-abcd-auth-token.1": "y",
        "chork-auth-shell-v2": "signed:awg",
        "chork-onboarded": `signed:${UID}:1`,
        "unrelated": "keep",
      }),
    );
    expect(redirectedTo(res)?.pathname).toBe("/login");
    const cleared = setCookies(res);
    expect(Object.keys(cleared).sort()).toEqual([
      "chork-auth-shell-v2",
      "chork-onboarded",
      "sb-abcd-auth-token.0",
      "sb-abcd-auth-token.1",
    ]);
    expect(Object.values(cleared).every((v) => v === "")).toBe(true);
  });

  it("treats a 400 the same way — the token will never work again", async () => {
    await primeMiddleware({ throws: { status: 400 } });
    const { proxy } = await import("./proxy");
    const res = await proxy(request("/friends", { "sb-abcd-auth-token": "x" }));
    expect(setCookies(res)).toHaveProperty("sb-abcd-auth-token", "");
  });

  it("degrades to signed-out on a transient failure WITHOUT touching the cookies", async () => {
    // A 500 or a network wobble: the session may be perfectly good.
    await primeMiddleware({ throws: { status: 500 } });
    const { proxy } = await import("./proxy");
    const res = await proxy(request("/friends", { "sb-abcd-auth-token": "x" }));
    expect(redirectedTo(res)?.pathname).toBe("/login");
    expect(setCookies(res)).toEqual({});
  });
});

describe("proxy: signed-in, cold cookies", () => {
  it("reads the profile once, stamps a SIGNED onboarded cookie, and a gym-aware shell", async () => {
    const sb = await primeMiddleware(
      { id: UID },
      {
        "table:profiles": { data: { onboarded: true, active_gym_id: "g1" } },
        "table:gym_admins": { data: null },
      },
    );
    const { proxy } = await import("./proxy");
    const res = await proxy(request("/friends"));
    expect(redirectedTo(res)).toBeNull();
    expect(setCookies(res)).toEqual({
      "chork-onboarded": `signed:${UID}:1`,
      "chork-auth-shell-v2": "signed:awg",
    });
    // One profile SELECT covers both cookies — not one per cookie.
    expect(sb.calls.filter((c) => c.source === "profiles" && c.method === "select")).toHaveLength(1);
  });

  it("adds the admin suffix when the caller runs a gym", async () => {
    // Without it the server rendered the nav without the Admin tab
    // and hydration added it a beat later, on every page load.
    await primeMiddleware(
      { id: UID },
      {
        "table:profiles": { data: { onboarded: true, active_gym_id: "g1" } },
        "table:gym_admins": { data: { user_id: UID } },
      },
    );
    const { proxy } = await import("./proxy");
    const res = await proxy(request("/friends"));
    expect(setCookies(res)["chork-auth-shell-v2"]).toBe("signed:awga");
  });

  it("paints the gymless shell for a climber with no active gym", async () => {
    await primeMiddleware(
      { id: UID },
      { "table:profiles": { data: { onboarded: true, active_gym_id: null } } },
    );
    const { proxy } = await import("./proxy");
    const res = await proxy(request("/match"));
    expect(setCookies(res)["chork-auth-shell-v2"]).toBe("signed:ang");
  });

  it("forces an un-onboarded climber to /onboarding and stamps no onboarded cookie", async () => {
    await primeMiddleware(
      { id: UID },
      { "table:profiles": { data: { onboarded: false, active_gym_id: null } } },
    );
    const { proxy } = await import("./proxy");
    const res = await proxy(request("/friends"));
    expect(redirectedTo(res)?.pathname).toBe("/onboarding");
    expect(setCookies(res)).not.toHaveProperty("chork-onboarded");
    // …and lets them stay on /onboarding itself.
    expect(redirectedTo(await proxy(request("/onboarding")))).toBeNull();
  });

  it("sends an onboarded climber away from /onboarding", async () => {
    // Previously a refresh could land here and get stuck.
    await primeMiddleware(
      { id: UID },
      { "table:profiles": { data: { onboarded: true, active_gym_id: null } } },
    );
    const { proxy } = await import("./proxy");
    expect(redirectedTo(await proxy(request("/onboarding")))?.pathname).toBe("/");
  });

  it("sends a signed-in visitor away from /login", async () => {
    await primeMiddleware(
      { id: UID },
      { "table:profiles": { data: { onboarded: true, active_gym_id: null } } },
    );
    const { proxy } = await import("./proxy");
    expect(redirectedTo(await proxy(request("/login")))?.pathname).toBe("/");
  });
});

describe("proxy: signed-in, warm cookies", () => {
  it("makes NO database call when both cookies are warm and signed", async () => {
    const sb = await primeMiddleware({ id: UID });
    const { proxy } = await import("./proxy");
    const res = await proxy(
      request("/friends", {
        "chork-onboarded": `signed:${UID}:1`,
        "chork-auth-shell-v2": "signed:awg",
      }),
    );
    expect(redirectedTo(res)).toBeNull();
    expect(sb.calls).toEqual([]);
    // Nothing changed, so nothing is rewritten.
    expect(setCookies(res)).toEqual({});
  });

  it("ignores a FORGED onboarded cookie and falls back to the profile read", async () => {
    // The cookie is a perf hint, not an auth decision — but a value
    // set from DevTools must not buy the fast path either.
    const sb = await primeMiddleware(
      { id: UID },
      { "table:profiles": { data: { onboarded: false, active_gym_id: null } } },
    );
    const { proxy } = await import("./proxy");
    const res = await proxy(request("/friends", { "chork-onboarded": `${UID}:1` }));
    expect(redirectedTo(res)?.pathname).toBe("/onboarding");
    expect(sb.calls.some((c) => c.source === "profiles")).toBe(true);
  });

  it("ignores an onboarded cookie stamped for a DIFFERENT user", async () => {
    const sb = await primeMiddleware(
      { id: UID },
      { "table:profiles": { data: { onboarded: true, active_gym_id: null } } },
    );
    const { proxy } = await import("./proxy");
    await proxy(request("/friends", { "chork-onboarded": "signed:someone-else:1" }));
    expect(sb.calls.some((c) => c.source === "profiles")).toBe(true);
  });

  it("recovers a missing shell cookie from the profile without re-reading onboarded", async () => {
    const sb = await primeMiddleware(
      { id: UID },
      {
        "table:profiles": { data: { active_gym_id: "g1" } },
        "table:gym_admins": { data: null },
      },
    );
    const { proxy } = await import("./proxy");
    const res = await proxy(request("/friends", { "chork-onboarded": `signed:${UID}:1` }));
    expect(setCookies(res)).toEqual({ "chork-auth-shell-v2": "signed:awg" });
    expect(sb.calls.filter((c) => c.source === "profiles" && c.method === "select")).toHaveLength(1);
  });

  it("trusts a v2 shell's admin bit rather than re-querying gym_admins", async () => {
    const sb = await primeMiddleware({ id: UID });
    const { proxy } = await import("./proxy");
    const res = await proxy(
      request("/friends", {
        "chork-onboarded": `signed:${UID}:1`,
        "chork-auth-shell-v2": "signed:anga",
      }),
    );
    expect(sb.calls.some((c) => c.source === "gym_admins")).toBe(false);
    expect(setCookies(res)).toEqual({});
  });
});
