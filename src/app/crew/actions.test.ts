import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireSignedIn: vi.fn() }));
vi.mock("@/lib/push/server", () => ({ sendPushToUsers: vi.fn() }));
vi.mock("@/lib/notify", () => ({ notifyUser: vi.fn() }));

// ────────────────────────────────────────────────────────────────
// Supabase client mock
// ────────────────────────────────────────────────────────────────
// Actions build Supabase queries by chaining — .from().insert(),
// .from().update().eq().eq().eq() etc. The mock below returns a thenable
// proxy so any chain resolves to whatever `nextResult` is primed with.
// Each test overrides `nextResult` (or `resultFor(...)` by first chain
// method called) to simulate success / RLS rejection / unique violation.

type SbResult = { data?: unknown; error?: { code?: string; message?: string } | null; count?: number };

function makeChain(resolve: () => Promise<SbResult> | SbResult) {
  const builder: Record<string, unknown> = {};
  const chain: (...args: unknown[]) => typeof builder = () => builder;
  const methods = [
    "select", "insert", "update", "delete", "upsert",
    "eq", "neq", "in", "or", "gte", "lt", "order", "limit",
    "maybeSingle", "single",
  ];
  for (const m of methods) (builder[m] as unknown) = chain;
  builder.then = (onFulfilled: (v: SbResult) => unknown) =>
    Promise.resolve(resolve()).then(onFulfilled);
  return builder;
}

function mockSupabase(results: Record<string, SbResult | (() => SbResult)> = {}) {
  // `from(name)` returns a chain whose final await resolves with the
  // result primed for that table. `rpc("name", …)` is primed the same way.
  return {
    from: (table: string) => makeChain(() => {
      const r = results[`table:${table}`];
      return typeof r === "function" ? r() : (r ?? { data: null });
    }),
    rpc: (name: string) => makeChain(() => {
      const r = results[`rpc:${name}`];
      return typeof r === "function" ? r() : (r ?? { data: null });
    }),
  };
}

const USER_A = "11111111-1111-1111-1111-111111111111";
const USER_B = "22222222-2222-2222-2222-222222222222";
const CREW_1 = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const INVITE_1 = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

beforeEach(() => {
  vi.resetAllMocks();
});

// ────────────────────────────────────────────────────────────────
// createCrew
// ────────────────────────────────────────────────────────────────
describe("createCrew", () => {
  it("rejects an empty name", async () => {
    const { createCrew } = await import("./actions");
    const result = await createCrew("");
    expect(result).toEqual({ error: expect.stringContaining("1–60") });
  });

  it("rejects a name longer than 60 chars", async () => {
    const { createCrew } = await import("./actions");
    const result = await createCrew("x".repeat(61));
    expect(result).toEqual({ error: expect.stringContaining("1–60") });
  });

  it("propagates auth errors", async () => {
    const { requireSignedIn } = await import("@/lib/auth");
    vi.mocked(requireSignedIn).mockResolvedValue({ error: "Not signed in" });
    const { createCrew } = await import("./actions");
    const result = await createCrew("Tuesday Crew");
    expect(result).toEqual({ error: "Not signed in" });
  });

  it("trims the name and returns the new crew id on success", async () => {
    const { requireSignedIn } = await import("@/lib/auth");
    const supabase = mockSupabase({
      // Pre-insert profile guard — resolves to an existing row so
      // the onboarding-check branch passes.
      "table:profiles": { data: { id: USER_A }, error: null },
      "table:crews": { data: { id: CREW_1 }, error: null },
    });
    vi.mocked(requireSignedIn).mockResolvedValue({
      supabase: supabase as never,
      userId: USER_A,
    });

    const { createCrew } = await import("./actions");
    const result = await createCrew("  Tuesday Crew  ");
    expect(result).toEqual({ success: true, crewId: CREW_1 });
  });

  it("maps the 42501 RLS code to a stale-session message", async () => {
    const { requireSignedIn } = await import("@/lib/auth");
    const supabase = mockSupabase({
      "table:profiles": { data: { id: USER_A }, error: null },
      "table:crews": { data: null, error: { code: "42501", message: "RLS violation" } },
    });
    vi.mocked(requireSignedIn).mockResolvedValue({
      supabase: supabase as never,
      userId: USER_A,
    });

    const { createCrew } = await import("./actions");
    const result = await createCrew("My Crew");
    expect(result).toEqual({
      error: "Session expired — refresh the page and try again.",
    });
  });

  it("tells the user to finish onboarding if their profile row is missing", async () => {
    const { requireSignedIn } = await import("@/lib/auth");
    const supabase = mockSupabase({
      "table:profiles": { data: null, error: null },
    });
    vi.mocked(requireSignedIn).mockResolvedValue({
      supabase: supabase as never,
      userId: USER_A,
    });

    const { createCrew } = await import("./actions");
    const result = await createCrew("My Crew");
    expect(result).toEqual({ error: "Finish onboarding before creating a crew." });
  });
});

// ────────────────────────────────────────────────────────────────
// inviteToCrew
// ────────────────────────────────────────────────────────────────
describe("inviteToCrew", () => {
  it("rejects malformed UUIDs", async () => {
    const { inviteToCrew } = await import("./actions");
    expect(await inviteToCrew("not-a-uuid", USER_B)).toEqual({ error: "Invalid request." });
    expect(await inviteToCrew(CREW_1, "also-not")).toEqual({ error: "Invalid request." });
  });

  it("rejects self-invite", async () => {
    const { requireSignedIn } = await import("@/lib/auth");
    vi.mocked(requireSignedIn).mockResolvedValue({
      supabase: mockSupabase() as never,
      userId: USER_A,
    });
    const { inviteToCrew } = await import("./actions");
    const result = await inviteToCrew(CREW_1, USER_A);
    expect(result).toEqual({ error: "You can't invite yourself." });
  });

  it("rejects when the daily rate limit bump returns false", async () => {
    const { requireSignedIn } = await import("@/lib/auth");
    const supabase = mockSupabase({
      "rpc:bump_invite_rate_limit": { data: false, error: null },
    });
    vi.mocked(requireSignedIn).mockResolvedValue({
      supabase: supabase as never,
      userId: USER_A,
    });
    const { inviteToCrew } = await import("./actions");
    const result = await inviteToCrew(CREW_1, USER_B);
    expect(result).toEqual({ error: expect.stringContaining("invite limit") });
  });

  it("rejects when target has allow_crew_invites=false", async () => {
    const { requireSignedIn } = await import("@/lib/auth");
    const supabase = mockSupabase({
      "rpc:bump_invite_rate_limit": { data: true, error: null },
      "table:profiles": { data: { allow_crew_invites: false }, error: null },
    });
    vi.mocked(requireSignedIn).mockResolvedValue({
      supabase: supabase as never,
      userId: USER_A,
    });
    const { inviteToCrew } = await import("./actions");
    const result = await inviteToCrew(CREW_1, USER_B);
    expect(result).toEqual({ error: expect.stringContaining("isn't taking invites") });
  });

  it("surfaces a friendly error on duplicate-invite unique violation", async () => {
    const { requireSignedIn } = await import("@/lib/auth");
    // Prime the insert-attempt sequence: pass pre-checks, fail on
    // insert with Postgres code 23505 (unique violation).
    const supabase = {
      from: (table: string) => {
        if (table === "profiles") {
          return makeChain(() => ({ data: { allow_crew_invites: true }, error: null }));
        }
        if (table === "crew_members") {
          return makeChain(() => ({ data: null, error: { code: "23505" } }));
        }
        return makeChain(() => ({ data: null }));
      },
      rpc: () => makeChain(() => ({ data: true, error: null })),
    };
    vi.mocked(requireSignedIn).mockResolvedValue({
      supabase: supabase as never,
      userId: USER_A,
    });
    const { inviteToCrew } = await import("./actions");
    const result = await inviteToCrew(CREW_1, USER_B);
    expect(result).toEqual({ error: expect.stringContaining("already has an invite") });
  });

  it("fires a push notification after a successful invite (best effort)", async () => {
    const { requireSignedIn } = await import("@/lib/auth");
    const { sendPushToUsers } = await import("@/lib/push/server");

    const supabase = {
      from: (table: string) => {
        if (table === "profiles") {
          return makeChain(() => ({
            // profile prefetch for allow_crew_invites AND the inviter
            // username lookup both land here — return a compatible shape.
            data: { allow_crew_invites: true, username: "alice" },
            error: null,
          }));
        }
        if (table === "crew_members") {
          return makeChain(() => ({ data: null, error: null }));
        }
        if (table === "crews") {
          return makeChain(() => ({ data: { name: "Tuesday Crew" }, error: null }));
        }
        return makeChain(() => ({ data: null }));
      },
      rpc: () => makeChain(() => ({ data: true, error: null })),
    };
    vi.mocked(requireSignedIn).mockResolvedValue({
      supabase: supabase as never,
      userId: USER_A,
    });
    vi.mocked(sendPushToUsers).mockResolvedValue({ sent: 1, removed: 0 });

    const { inviteToCrew } = await import("./actions");
    await inviteToCrew(CREW_1, USER_B);

    expect(sendPushToUsers).toHaveBeenCalledWith(
      [USER_B],
      expect.objectContaining({
        title: "New crew invite",
        url: "/crew",
      }),
      expect.objectContaining({ category: "invite_received" }),
    );
    const { notifyUser } = await import("@/lib/notify");
    expect(notifyUser).toHaveBeenCalledWith(
      expect.anything(),
      USER_B,
      expect.objectContaining({ kind: "crew_invite_received" }),
    );
  });

  it("still returns success when the push dispatch throws", async () => {
    const { requireSignedIn } = await import("@/lib/auth");
    const { sendPushToUsers } = await import("@/lib/push/server");

    const supabase = {
      from: (table: string) => {
        if (table === "profiles") return makeChain(() => ({ data: { allow_crew_invites: true, username: "alice" }, error: null }));
        if (table === "blocked_users") return makeChain(() => ({ data: [], error: null }));
        if (table === "crew_members") return makeChain(() => ({ data: null, error: null }));
        if (table === "crews") return makeChain(() => ({ data: { name: "X" }, error: null }));
        return makeChain(() => ({ data: null }));
      },
      rpc: () => makeChain(() => ({ data: true, error: null })),
    };
    vi.mocked(requireSignedIn).mockResolvedValue({
      supabase: supabase as never,
      userId: USER_A,
    });
    vi.mocked(sendPushToUsers).mockRejectedValue(new Error("push service down"));

    const { inviteToCrew } = await import("./actions");
    const result = await inviteToCrew(CREW_1, USER_B);
    expect(result).toEqual({ success: true });
  });
});

// ────────────────────────────────────────────────────────────────
// acceptCrewInvite / declineCrewInvite
// ────────────────────────────────────────────────────────────────
describe("acceptCrewInvite", () => {
  it("rejects malformed UUID", async () => {
    const { acceptCrewInvite } = await import("./actions");
    expect(await acceptCrewInvite("no")).toEqual({ error: "Invalid invite." });
  });

  it("returns success when the update lands (RLS enforces ownership + pending)", async () => {
    const { requireSignedIn } = await import("@/lib/auth");
    vi.mocked(requireSignedIn).mockResolvedValue({
      supabase: mockSupabase({
        "table:crew_members": { data: null, error: null },
      }) as never,
      userId: USER_A,
    });
    const { acceptCrewInvite } = await import("./actions");
    expect(await acceptCrewInvite(INVITE_1)).toEqual({ success: true });
  });

  it("propagates DB errors", async () => {
    const { requireSignedIn } = await import("@/lib/auth");
    vi.mocked(requireSignedIn).mockResolvedValue({
      supabase: mockSupabase({
        "table:crew_members": { data: null, error: { code: "42501", message: "boom" } },
      }) as never,
      userId: USER_A,
    });
    const { acceptCrewInvite } = await import("./actions");
    expect(await acceptCrewInvite(INVITE_1)).toEqual({ error: "boom" });
  });

  it("pushes + notifies the inviter on success (category: invite_accepted)", async () => {
    const { requireSignedIn } = await import("@/lib/auth");
    const { sendPushToUsers } = await import("@/lib/push/server");
    const { notifyUser } = await import("@/lib/notify");
    const supabase = {
      from: (table: string) => {
        if (table === "crew_members") {
          return makeChain(() => ({
            // First read = the invite prefetch (invited_by + crew
            // name via embedded join). Second call = the UPDATE.
            data: {
              invited_by: USER_B,
              crew_id: CREW_1,
              crew: { name: "Tuesday Crew" },
            },
            error: null,
          }));
        }
        if (table === "profiles") {
          return makeChain(() => ({ data: { username: "alice" }, error: null }));
        }
        return makeChain(() => ({ data: null }));
      },
    };
    vi.mocked(requireSignedIn).mockResolvedValue({
      supabase: supabase as never,
      userId: USER_A,
    });

    const { acceptCrewInvite } = await import("./actions");
    expect(await acceptCrewInvite(INVITE_1)).toEqual({ success: true });

    expect(sendPushToUsers).toHaveBeenCalledWith(
      [USER_B],
      expect.objectContaining({ title: "Invite accepted" }),
      expect.objectContaining({ category: "invite_accepted" }),
    );
    expect(notifyUser).toHaveBeenCalledWith(
      expect.anything(),
      USER_B,
      expect.objectContaining({
        kind: "crew_invite_accepted",
        payload: expect.objectContaining({ crew_id: CREW_1 }),
      }),
    );
  });

  it("skips push when the invite prefetch couldn't find the inviter", async () => {
    const { requireSignedIn } = await import("@/lib/auth");
    const { sendPushToUsers } = await import("@/lib/push/server");
    vi.mocked(requireSignedIn).mockResolvedValue({
      supabase: mockSupabase({
        "table:crew_members": { data: null, error: null },
      }) as never,
      userId: USER_A,
    });
    const { acceptCrewInvite } = await import("./actions");
    expect(await acceptCrewInvite(INVITE_1)).toEqual({ success: true });
    expect(sendPushToUsers).not.toHaveBeenCalled();
  });
});

describe("declineCrewInvite", () => {
  it("rejects malformed UUID", async () => {
    const { declineCrewInvite } = await import("./actions");
    expect(await declineCrewInvite("x")).toEqual({ error: "Invalid invite." });
  });

  it("returns success on delete", async () => {
    const { requireSignedIn } = await import("@/lib/auth");
    vi.mocked(requireSignedIn).mockResolvedValue({
      supabase: mockSupabase({
        "table:crew_members": { data: null, error: null },
      }) as never,
      userId: USER_A,
    });
    const { declineCrewInvite } = await import("./actions");
    expect(await declineCrewInvite(INVITE_1)).toEqual({ success: true });
  });
});

// ────────────────────────────────────────────────────────────────
// leaveCrew
// ────────────────────────────────────────────────────────────────
describe("leaveCrew", () => {
  it("rejects malformed UUID", async () => {
    const { leaveCrew } = await import("./actions");
    expect(await leaveCrew("notuuid")).toEqual({ error: "Invalid crew." });
  });

  it("deletes a non-creator member row", async () => {
    const { requireSignedIn } = await import("@/lib/auth");
    vi.mocked(requireSignedIn).mockResolvedValue({
      supabase: mockSupabase({
        "table:crews": { data: { created_by: USER_B }, error: null },
        "table:crew_members": { data: null, error: null, count: 3 },
      }) as never,
      userId: USER_A,
    });
    const { leaveCrew } = await import("./actions");
    expect(await leaveCrew(CREW_1)).toEqual({ success: true });
  });

  it("refuses when the creator tries to leave with other members present", async () => {
    const { requireSignedIn } = await import("@/lib/auth");
    vi.mocked(requireSignedIn).mockResolvedValue({
      supabase: mockSupabase({
        "table:crews": { data: { created_by: USER_A }, error: null },
        "table:crew_members": { data: null, error: null, count: 3 },
      }) as never,
      userId: USER_A,
    });
    const { leaveCrew } = await import("./actions");
    const res = await leaveCrew(CREW_1);
    expect("error" in res).toBe(true);
  });

  it("deletes the crew entirely when the solo creator leaves", async () => {
    const { requireSignedIn } = await import("@/lib/auth");
    vi.mocked(requireSignedIn).mockResolvedValue({
      supabase: mockSupabase({
        "table:crews": { data: { created_by: USER_A }, error: null },
        "table:crew_members": { data: null, error: null, count: 1 },
      }) as never,
      userId: USER_A,
    });
    const { leaveCrew } = await import("./actions");
    expect(await leaveCrew(CREW_1)).toEqual({ success: true });
  });

  it("errors cleanly when the crew can't be found", async () => {
    const { requireSignedIn } = await import("@/lib/auth");
    vi.mocked(requireSignedIn).mockResolvedValue({
      supabase: mockSupabase({
        "table:crews": { data: null, error: null },
        "table:crew_members": { data: null, error: null, count: 0 },
      }) as never,
      userId: USER_A,
    });
    const { leaveCrew } = await import("./actions");
    expect(await leaveCrew(CREW_1)).toEqual({ error: "Crew not found." });
  });
});

// ────────────────────────────────────────────────────────────────
// setAllowCrewInvites
// ────────────────────────────────────────────────────────────────
describe("setAllowCrewInvites", () => {
  it("updates the caller's profile and returns success", async () => {
    const { requireSignedIn } = await import("@/lib/auth");
    vi.mocked(requireSignedIn).mockResolvedValue({
      supabase: mockSupabase({
        "table:profiles": { data: null, error: null },
      }) as never,
      userId: USER_A,
    });
    const { setAllowCrewInvites } = await import("./actions");
    expect(await setAllowCrewInvites(false)).toEqual({ success: true });
    expect(await setAllowCrewInvites(true)).toEqual({ success: true });
  });
});

// ────────────────────────────────────────────────────────────────
// transferCrewOwnership
// ────────────────────────────────────────────────────────────────
describe("transferCrewOwnership", () => {
  it("rejects malformed UUIDs", async () => {
    const { transferCrewOwnership } = await import("./actions");
    expect(await transferCrewOwnership("nope", USER_B)).toEqual({ error: "Invalid request." });
    expect(await transferCrewOwnership(CREW_1, "nope")).toEqual({ error: "Invalid request." });
  });

  it("refuses self-transfer", async () => {
    const { requireSignedIn } = await import("@/lib/auth");
    vi.mocked(requireSignedIn).mockResolvedValue({
      supabase: mockSupabase() as never,
      userId: USER_A,
    });
    const { transferCrewOwnership } = await import("./actions");
    expect(await transferCrewOwnership(CREW_1, USER_A)).toEqual({
      error: "You're already the creator.",
    });
  });

  it("refuses when the caller isn't the current creator", async () => {
    const { requireSignedIn } = await import("@/lib/auth");
    vi.mocked(requireSignedIn).mockResolvedValue({
      supabase: mockSupabase({
        "table:crews": { data: { created_by: USER_B }, error: null },
      }) as never,
      userId: USER_A,
    });
    const { transferCrewOwnership } = await import("./actions");
    expect(await transferCrewOwnership(CREW_1, USER_B)).toEqual({
      error: "Only the current creator can transfer a crew.",
    });
  });

  it("refuses when the target isn't an active member", async () => {
    const { requireSignedIn } = await import("@/lib/auth");
    let call = 0;
    const supabase = {
      from: (table: string) => {
        if (table === "crews") {
          return makeChain(() => ({ data: { created_by: USER_A }, error: null }));
        }
        if (table === "crew_members") {
          call++;
          // First call = target-active lookup; return null to fail.
          return makeChain(() => ({ data: null, error: null }));
        }
        return makeChain(() => ({ data: null }));
      },
    };
    vi.mocked(requireSignedIn).mockResolvedValue({
      supabase: supabase as never,
      userId: USER_A,
    });
    const { transferCrewOwnership } = await import("./actions");
    expect(await transferCrewOwnership(CREW_1, USER_B)).toEqual({
      error: "That climber isn't an active member of this crew.",
    });
    expect(call).toBeGreaterThan(0);
  });

  it("succeeds on the happy path + pushes + notifies", async () => {
    const { requireSignedIn } = await import("@/lib/auth");
    const { sendPushToUsers } = await import("@/lib/push/server");
    const { notifyUser } = await import("@/lib/notify");
    const supabase = {
      from: (table: string) => {
        if (table === "crews") {
          return makeChain(() => ({
            // Two reads against `crews` — creator check + name lookup
            // for the push body. Both can return the same shape.
            data: { created_by: USER_A, name: "Tuesday Crew" },
            error: null,
          }));
        }
        if (table === "crew_members") {
          return makeChain(() => ({ data: { id: "row1" }, error: null }));
        }
        if (table === "profiles") {
          return makeChain(() => ({ data: { username: "alice" }, error: null }));
        }
        return makeChain(() => ({ data: null }));
      },
    };
    vi.mocked(requireSignedIn).mockResolvedValue({
      supabase: supabase as never,
      userId: USER_A,
    });

    const { transferCrewOwnership } = await import("./actions");
    expect(await transferCrewOwnership(CREW_1, USER_B)).toEqual({ success: true });

    expect(sendPushToUsers).toHaveBeenCalledWith(
      [USER_B],
      expect.objectContaining({ title: "You're now the crew creator" }),
      expect.objectContaining({ category: "ownership_changed" }),
    );
    expect(notifyUser).toHaveBeenCalledWith(
      expect.anything(),
      USER_B,
      expect.objectContaining({ kind: "crew_ownership_transferred" }),
    );
  });
});
