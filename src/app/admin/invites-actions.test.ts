/**
 * acceptAdminInvite — token-gated promotion into gym_admins, run
 * under the service role. The validation ladder (not found / already
 * used / expired / wrong email) is easy to silently regress; these
 * tests pin every rung through the action's real interface.
 *
 * (Ported from admin-mutations.test.ts when the pass-through
 * mutation layer was inlined into the actions, 2026-08.)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockSupabase } from "@/test/mock-supabase";

vi.mock("@/lib/auth", () => ({
  requireSignedIn: vi.fn(),
  gateGymAdminMutation: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: vi.fn(),
}));

const USER_A = "11111111-1111-1111-1111-111111111111";
const GYM_1 = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const TOKEN = "a-plausible-invite-token-string";

beforeEach(() => {
  vi.resetAllMocks();
});

async function primeSignedIn() {
  const { requireSignedIn } = await import("@/lib/auth");
  vi.mocked(requireSignedIn).mockResolvedValue({
    supabase: createMockSupabase() as never,
    userId: USER_A,
  });
}

/** Service client whose getUserById resolves the caller's email. */
async function primeService(
  primed: Parameters<typeof createMockSupabase>[0],
  email: string | null = "tom@chork.test",
) {
  const { createServiceClient } = await import("@/lib/supabase/server");
  const service = createMockSupabase(primed);
  service.auth.admin.getUserById.mockResolvedValue({
    data: email ? { user: { email } } : { user: null },
    error: null,
  });
  vi.mocked(createServiceClient).mockReturnValue(service as never);
  return service;
}

describe("acceptAdminInvite", () => {
  it("rejects a token that is too short to be real", async () => {
    const { acceptAdminInvite } = await import("./invites-actions");
    expect(await acceptAdminInvite("short")).toEqual({
      error: "Invalid invite link.",
    });
  });

  it("surfaces auth failure", async () => {
    const { requireSignedIn } = await import("@/lib/auth");
    vi.mocked(requireSignedIn).mockResolvedValue({ error: "Not signed in" });
    const { acceptAdminInvite } = await import("./invites-actions");
    expect(await acceptAdminInvite(TOKEN)).toEqual({ error: "Not signed in" });
  });

  it("errors when the caller's email can't be read", async () => {
    await primeSignedIn();
    await primeService({}, null);
    const { acceptAdminInvite } = await import("./invites-actions");
    expect(await acceptAdminInvite(TOKEN)).toEqual({
      error: "Could not read your email address.",
    });
  });

  it("returns 'Invite not found' when the token doesn't resolve", async () => {
    await primeSignedIn();
    await primeService({ "table:gym_invites": { data: null, error: null } });
    const { acceptAdminInvite } = await import("./invites-actions");
    expect(await acceptAdminInvite(TOKEN)).toEqual({
      error: "Invite not found.",
    });
  });

  it("rejects already-accepted invites", async () => {
    await primeSignedIn();
    await primeService({
      "table:gym_invites": {
        data: {
          id: "inv1",
          gym_id: GYM_1,
          email: "tom@chork.test",
          role: "admin",
          accepted_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 86_400_000).toISOString(),
        },
      },
    });
    const { acceptAdminInvite } = await import("./invites-actions");
    expect(await acceptAdminInvite(TOKEN)).toEqual({
      error: "This invite has already been used.",
    });
  });

  it("rejects expired invites", async () => {
    await primeSignedIn();
    await primeService({
      "table:gym_invites": {
        data: {
          id: "inv1",
          gym_id: GYM_1,
          email: "tom@chork.test",
          role: "admin",
          accepted_at: null,
          expires_at: new Date(Date.now() - 86_400_000).toISOString(),
        },
      },
    });
    const { acceptAdminInvite } = await import("./invites-actions");
    expect(await acceptAdminInvite(TOKEN)).toEqual({
      error: "This invite has expired.",
    });
  });

  it("rejects invites addressed to a different email", async () => {
    await primeSignedIn();
    await primeService({
      "table:gym_invites": {
        data: {
          id: "inv1",
          gym_id: GYM_1,
          email: "someone-else@chork.test",
          role: "admin",
          accepted_at: null,
          expires_at: new Date(Date.now() + 86_400_000).toISOString(),
        },
      },
    });
    const { acceptAdminInvite } = await import("./invites-actions");
    expect(await acceptAdminInvite(TOKEN)).toEqual({
      error: "This invite was issued to a different email address.",
    });
  });

  it("matches emails case-insensitively and seats the admin on the happy path", async () => {
    await primeSignedIn();
    const service = await primeService(
      {
        "table:gym_invites": [
          {
            data: {
              id: "inv1",
              gym_id: GYM_1,
              email: "TOM@chork.test",
              role: "admin",
              accepted_at: null,
              expires_at: new Date(Date.now() + 86_400_000).toISOString(),
            },
          },
          { data: null, error: null }, // mark-accepted update
        ],
        "table:gym_admins": { data: null, error: null },
      },
      "tom@CHORK.test",
    );

    const { acceptAdminInvite } = await import("./invites-actions");
    expect(await acceptAdminInvite(TOKEN)).toEqual({
      success: true,
      gymId: GYM_1,
    });

    // The seat is an upsert keyed on (gym_id, user_id) so a re-accept
    // can't duplicate the row.
    const upsert = service.calls.find(
      (c) => c.source === "gym_admins" && c.method === "upsert",
    );
    expect(upsert?.args).toEqual([
      { gym_id: GYM_1, user_id: USER_A, role: "admin" },
      { onConflict: "gym_id,user_id" },
    ]);
  });

  it("maps a friendly error when the admin seat insert fails", async () => {
    await primeSignedIn();
    await primeService({
      "table:gym_invites": {
        data: {
          id: "inv1",
          gym_id: GYM_1,
          email: "tom@chork.test",
          role: "admin",
          accepted_at: null,
          expires_at: new Date(Date.now() + 86_400_000).toISOString(),
        },
      },
      "table:gym_admins": {
        data: null,
        error: { code: "42501", message: "rls denies" },
      },
    });
    const { acceptAdminInvite } = await import("./invites-actions");
    expect(await acceptAdminInvite(TOKEN)).toEqual({
      error: "You don't have permission to do that.",
    });
  });
});
