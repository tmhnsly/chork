/**
 * Admin invites. `acceptAdminInvite` is a token-gated promotion into
 * gym_admins, run under the service role — the validation ladder (not
 * found / already used / expired / wrong email) is easy to silently
 * regress, so every rung is pinned through the action's real
 * interface. `sendAdminInvite` / `cancelAdminInvite` validation and
 * auth tests joined it when the admin barrel went.
 *
 * (Ported from admin-mutations.test.ts when the pass-through
 * mutation layer was inlined into the actions, 2026-08.)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockSupabase } from "@/test/mock-supabase";

vi.mock("@/lib/auth", async () => (await import("@/test/mock-auth")).mockAuthModule());
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

describe("sendAdminInvite", () => {
  it("rejects malformed emails", async () => {
    const { sendAdminInvite } = await import("./invites-actions");
    expect(
      await sendAdminInvite({ gymId: GYM_1, email: "nope", role: "admin" }),
    ).toHaveProperty("error", "Enter a valid email address.");
  });

  it("rejects malformed gym ids via the gate", async () => {
    const { requireGymAdmin } = await import("@/lib/auth");
    vi.mocked(requireGymAdmin).mockResolvedValue({ error: "Invalid gym" });
    const { sendAdminInvite } = await import("./invites-actions");
    expect(
      await sendAdminInvite({ gymId: "not-a-uuid", email: "a@b.co", role: "admin" }),
    ).toEqual({ error: "Invalid gym" });
  });

  it("rejects owner invites from non-owners", async () => {
    const { requireGymAdmin } = await import("@/lib/auth");
    vi.mocked(requireGymAdmin).mockResolvedValue({
      supabase: createMockSupabase() as never,
      userId: USER_A,
      gymId: GYM_1,
      isOwner: false,
    });
    const { sendAdminInvite } = await import("./invites-actions");
    expect(
      await sendAdminInvite({ gymId: GYM_1, email: "x@chork.test", role: "owner" }),
    ).toEqual({ error: "Only owners can invite other owners." });
  });

  it("surfaces the invite URL on success", async () => {
    const { requireGymAdmin } = await import("@/lib/auth");
    vi.mocked(requireGymAdmin).mockResolvedValue({
      supabase: createMockSupabase({ "table:gym_invites": { data: null, error: null } }) as never,
      userId: USER_A,
      gymId: GYM_1,
      isOwner: true,
    });
    const { sendAdminInvite } = await import("./invites-actions");
    const res = await sendAdminInvite({
      gymId: GYM_1,
      email: "x@chork.test",
      role: "owner",
    });
    expect(res).toMatchObject({ success: true });
    if (!("error" in res)) expect(res.inviteUrl).toContain("/admin/invite/");
  });
});

// ────────────────────────────────────────────────────────────────
// cancelAdminInvite
// ────────────────────────────────────────────────────────────────
describe("cancelAdminInvite", () => {
  it("rejects malformed ids", async () => {
    const { cancelAdminInvite } = await import("./invites-actions");
    expect(await cancelAdminInvite("abc")).toEqual({ error: "Invalid invite" });
  });

  it("returns 'Invite not found' when the delete affects zero rows", async () => {
    // Post-refactor: cancelAdminInvite relies on gym_invites RLS to
    // authorise the delete (admins only). An empty `data[]` back from
    // `.delete().select("id")` means either the invite was already
    // wiped OR the caller isn't a gym admin — we collapse the two so
    // existence doesn't leak to non-admins.
    const { requireSignedIn } = await import("@/lib/auth");
    vi.mocked(requireSignedIn).mockResolvedValue({
      supabase: createMockSupabase({ "table:gym_invites": { data: [], error: null } }) as never,
      userId: "u1",
    });
    const { cancelAdminInvite } = await import("./invites-actions");
    expect(await cancelAdminInvite(GYM_1)).toEqual({ error: "Invite not found." });
  });

  it("surfaces auth failure from requireSignedIn", async () => {
    const { requireSignedIn } = await import("@/lib/auth");
    vi.mocked(requireSignedIn).mockResolvedValue({ error: "Not signed in" });
    const { cancelAdminInvite } = await import("./invites-actions");
    expect(await cancelAdminInvite(GYM_1)).toEqual({ error: "Not signed in" });
  });
});

// ────────────────────────────────────────────────────────────────
// acceptAdminInvite
// ────────────────────────────────────────────────────────────────
describe("acceptAdminInvite", () => {
  it("rejects tokens shorter than 20 chars", async () => {
    const { acceptAdminInvite } = await import("./invites-actions");
    expect(await acceptAdminInvite("short")).toEqual({
      error: "Invalid invite link.",
    });
  });
});

// ────────────────────────────────────────────────────────────────
// Sets — validateSetInput coverage
// ────────────────────────────────────────────────────────────────
