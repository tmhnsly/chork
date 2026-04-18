import { describe, it, expect, vi, beforeEach } from "vitest";

// Shape of the mock cookies jar. The signOut path wipes two
// non-Supabase cookies (`chork-onboarded` / `chork-auth-shell`)
// regardless of whether signOut itself succeeded — a regression
// here would let the previous session's shell variant bleed into
// the next render's first byte.
const cookieDelete = vi.fn();

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ delete: cookieDelete })),
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: vi.fn(),
}));
vi.mock("@/lib/errors", () => ({
  formatAuthError: (e: unknown) => ({
    message: (e as { message?: string }).message ?? "err",
    field: undefined,
  }),
  formatError: (e: unknown) => (e as { message?: string }).message ?? "err",
}));

function mockSupabase(signInResult: unknown, signOutResult: unknown = { error: null }) {
  return {
    auth: {
      signInWithPassword: vi.fn().mockResolvedValue(signInResult),
      signOut: vi.fn().mockResolvedValue(signOutResult),
      signUp: vi.fn().mockResolvedValue({ error: null }),
    },
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  cookieDelete.mockReset();
});

describe("signInAction", () => {
  it("rejects missing email", async () => {
    const { signInAction } = await import("./actions");
    const fd = new FormData();
    fd.set("password", "pw");
    const result = await signInAction(undefined, fd);
    expect(result.error).toMatch(/email/i);
    expect(result.field).toBe("email");
  });

  it("rejects missing password", async () => {
    const { signInAction } = await import("./actions");
    const fd = new FormData();
    fd.set("email", "a@b.com");
    const result = await signInAction(undefined, fd);
    expect(result.error).toMatch(/password/i);
    expect(result.field).toBe("password");
  });

  it("surfaces Supabase auth errors", async () => {
    const supa = mockSupabase({ error: { message: "Invalid login" } });
    const { createServerSupabase } = await import("@/lib/supabase/server");
    vi.mocked(createServerSupabase).mockResolvedValue(supa as never);

    const { signInAction } = await import("./actions");
    const fd = new FormData();
    fd.set("email", "a@b.com");
    fd.set("password", "pw");
    const result = await signInAction(undefined, fd);
    expect(result.error).toBe("Invalid login");
  });

  // Open-redirect guard: a protocol-relative URL (`//evil.com`) or a
  // fully-qualified URL must never be honoured as the post-login
  // target — that's the classic auth-flow pivot. Relative paths are
  // the only safe shape.
  it("rejects protocol-relative next values (open-redirect guard)", async () => {
    const supa = mockSupabase({ error: null });
    const { createServerSupabase } = await import("@/lib/supabase/server");
    vi.mocked(createServerSupabase).mockResolvedValue(supa as never);

    const { signInAction } = await import("./actions");
    const fd = new FormData();
    fd.set("email", "a@b.com");
    fd.set("password", "pw");
    fd.set("next", "//evil.com/steal");
    const result = await signInAction(undefined, fd);
    expect(result.success).toBe(true);
    expect(result.next).toBe("/");
  });

  it("rejects fully-qualified next URLs", async () => {
    const supa = mockSupabase({ error: null });
    const { createServerSupabase } = await import("@/lib/supabase/server");
    vi.mocked(createServerSupabase).mockResolvedValue(supa as never);

    const { signInAction } = await import("./actions");
    const fd = new FormData();
    fd.set("email", "a@b.com");
    fd.set("password", "pw");
    fd.set("next", "https://attacker.example/landing");
    const result = await signInAction(undefined, fd);
    expect(result.next).toBe("/");
  });

  it("honours safe relative next paths", async () => {
    const supa = mockSupabase({ error: null });
    const { createServerSupabase } = await import("@/lib/supabase/server");
    vi.mocked(createServerSupabase).mockResolvedValue(supa as never);

    const { signInAction } = await import("./actions");
    const fd = new FormData();
    fd.set("email", "a@b.com");
    fd.set("password", "pw");
    fd.set("next", "/jam/new");
    const result = await signInAction(undefined, fd);
    expect(result.success).toBe(true);
    expect(result.next).toBe("/jam/new");
  });
});

describe("signOutAction", () => {
  it("wipes stale auth-shell cookies on success", async () => {
    const supa = mockSupabase({ error: null }, { error: null });
    const { createServerSupabase } = await import("@/lib/supabase/server");
    vi.mocked(createServerSupabase).mockResolvedValue(supa as never);

    const { signOutAction } = await import("./actions");
    await signOutAction();

    expect(cookieDelete).toHaveBeenCalledWith("chork-onboarded");
    expect(cookieDelete).toHaveBeenCalledWith("chork-auth-shell");
  });

  it("wipes stale cookies even when Supabase signOut errors", async () => {
    // The whole point of the belt-and-braces cookie purge is that
    // an auth.signOut() failure shouldn't leave the previous
    // session's shell-variant marker in place — if it did, the next
    // render would paint the wrong nav on first byte.
    const supa = mockSupabase({ error: null }, { error: { message: "boom" } });
    const { createServerSupabase } = await import("@/lib/supabase/server");
    vi.mocked(createServerSupabase).mockResolvedValue(supa as never);

    const { signOutAction } = await import("./actions");
    const result = await signOutAction();

    expect(result.error).toBeDefined();
    expect(cookieDelete).toHaveBeenCalledWith("chork-onboarded");
    expect(cookieDelete).toHaveBeenCalledWith("chork-auth-shell");
  });
});
