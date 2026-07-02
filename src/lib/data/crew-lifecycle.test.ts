import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));
vi.mock("@/lib/notify", () => ({ notify: vi.fn() }));

import {
  acceptCrewInvite,
  sendCrewInvite,
  transferCrewOwnership,
} from "./crew-lifecycle";

const USER_A = "11111111-1111-1111-1111-111111111111";
const USER_B = "22222222-2222-2222-2222-222222222222";
const CREW_1 = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

// Chainable Supabase mock — same pattern as actions.test.ts.
type SbResult = { data?: unknown; error?: { code?: string; message?: string } | null };

function makeChain(resolve: () => SbResult) {
  const builder: Record<string, unknown> = {};
  const chain: (...args: unknown[]) => typeof builder = () => builder;
  for (const m of ["select", "insert", "update", "delete", "eq", "maybeSingle", "single"]) {
    builder[m] = chain;
  }
  builder.then = (onFulfilled: (v: SbResult) => unknown) =>
    Promise.resolve(resolve()).then(onFulfilled);
  return builder;
}

function makeSupabase(opts: {
  rateLimit?: boolean | null;
  results?: Record<string, SbResult | (() => SbResult)>;
}) {
  return {
    rpc: () => makeChain(() => ({ data: opts.rateLimit ?? true })),
    from: (table: string) =>
      makeChain(() => {
        const r = opts.results?.[`table:${table}`];
        return typeof r === "function" ? r() : (r ?? { data: null });
      }),
  } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ────────────────────────────────────────────────────────────────
// sendCrewInvite
// ────────────────────────────────────────────────────────────────

describe("sendCrewInvite", () => {
  it("rejects when bump_invite_rate_limit returns false", async () => {
    const supabase = makeSupabase({ rateLimit: false });
    const result = await sendCrewInvite({
      supabase,
      actorId: USER_A,
      crewId: CREW_1,
      targetUserId: USER_B,
    });
    expect(result).toEqual({
      error: "You've hit today's invite limit. Try again tomorrow.",
    });
    const { notify } = await import("@/lib/notify");
    expect(notify).not.toHaveBeenCalled();
  });

  it("rejects when target profile is missing", async () => {
    const supabase = makeSupabase({
      results: { "table:profiles": { data: null } },
    });
    const result = await sendCrewInvite({
      supabase,
      actorId: USER_A,
      crewId: CREW_1,
      targetUserId: USER_B,
    });
    expect(result).toEqual({ error: "User not found." });
  });

  it("rejects when the target has opted out of invites", async () => {
    const supabase = makeSupabase({
      results: { "table:profiles": { data: { allow_crew_invites: false } } },
    });
    const result = await sendCrewInvite({
      supabase,
      actorId: USER_A,
      crewId: CREW_1,
      targetUserId: USER_B,
    });
    expect(result).toEqual({ error: "That climber isn't taking invites." });
  });

  it("maps unique-violation (23505) to the dedup error message", async () => {
    const supabase = makeSupabase({
      results: {
        "table:profiles": { data: { allow_crew_invites: true, username: "alice" } },
        "table:crew_members": { data: null, error: { code: "23505", message: "dup" } },
        "table:crews": { data: { name: "Tuesday Crew" } },
      },
    });
    const result = await sendCrewInvite({
      supabase,
      actorId: USER_A,
      crewId: CREW_1,
      targetUserId: USER_B,
    });
    expect(result).toEqual({
      error: "This climber already has an invite for that crew.",
    });
    const { notify } = await import("@/lib/notify");
    expect(notify).not.toHaveBeenCalled();
  });

  it("happy path: dispatches notification + busts crew + userCrews tags", async () => {
    const supabase = makeSupabase({
      results: {
        "table:profiles": { data: { allow_crew_invites: true, username: "alice" } },
        "table:crew_members": { data: { id: "invite-1" }, error: null },
        "table:crews": { data: { name: "Tuesday Crew" } },
      },
    });
    const result = await sendCrewInvite({
      supabase,
      actorId: USER_A,
      crewId: CREW_1,
      targetUserId: USER_B,
    });
    expect(result).toEqual({ ok: true });

    const { notify } = await import("@/lib/notify");
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "crew_invite_received",
        recipient: USER_B,
        actor: USER_A,
        crewId: CREW_1,
        crewName: "Tuesday Crew",
        inviteId: "invite-1",
        inviterUsername: "alice",
      }),
    );

    const { revalidateTag } = await import("next/cache");
    expect(revalidateTag).toHaveBeenCalledWith(`crew:${CREW_1}`, "max");
    expect(revalidateTag).toHaveBeenCalledWith(`user:${USER_A}:crews`, "max");
  });

  it("still returns ok if notify dispatch fails — invite row already written", async () => {
    const { notify } = await import("@/lib/notify");
    vi.mocked(notify).mockRejectedValueOnce(new Error("dispatcher boom"));

    const supabase = makeSupabase({
      results: {
        "table:profiles": { data: { allow_crew_invites: true } },
        "table:crew_members": { data: { id: "invite-1" }, error: null },
        "table:crews": { data: { name: "X" } },
      },
    });
    const result = await sendCrewInvite({
      supabase,
      actorId: USER_A,
      crewId: CREW_1,
      targetUserId: USER_B,
    });
    expect(result).toEqual({ ok: true });
  });
});

// ────────────────────────────────────────────────────────────────
// acceptCrewInvite
// ────────────────────────────────────────────────────────────────

describe("acceptCrewInvite", () => {
  it("returns 'Invite not found.' when the conditional flip matches no row (TOCTOU pin)", async () => {
    // The UPDATE carries `.eq("status", "pending")` — a concurrently
    // cancelled invite returns no row, and we must NOT push a phantom
    // "accepted" notification to the inviter.
    const supabase = makeSupabase({
      results: { "table:crew_members": { data: null } },
    });
    const result = await acceptCrewInvite({
      supabase,
      actorId: USER_A,
      crewMemberId: "invite-1",
    });
    expect(result).toEqual({ error: "Invite not found." });
    const { notify } = await import("@/lib/notify");
    expect(notify).not.toHaveBeenCalled();
  });

  it("maps a DB error on the flip to a friendly message", async () => {
    const supabase = makeSupabase({
      results: {
        "table:crew_members": { data: null, error: { code: "42501", message: "rls" } },
      },
    });
    const result = await acceptCrewInvite({
      supabase,
      actorId: USER_A,
      crewMemberId: "invite-1",
    });
    expect(result).toEqual({ error: "You don't have permission to do that." });
  });

  it("happy path: notifies the inviter + busts crew tag", async () => {
    const supabase = makeSupabase({
      results: {
        "table:crew_members": {
          data: {
            invited_by: USER_B,
            crew_id: CREW_1,
            crew: { name: "Tuesday Crew" },
          },
        },
        "table:profiles": { data: { username: "alice" } },
      },
    });
    const result = await acceptCrewInvite({
      supabase,
      actorId: USER_A,
      crewMemberId: "invite-1",
    });
    expect(result).toEqual({ ok: true });

    const { notify } = await import("@/lib/notify");
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "crew_invite_accepted",
        recipient: USER_B,
        actor: USER_A,
        crewId: CREW_1,
        crewName: "Tuesday Crew",
        accepterUsername: "alice",
      }),
    );

    const { revalidateTag } = await import("next/cache");
    expect(revalidateTag).toHaveBeenCalledWith(`crew:${CREW_1}`, "max");
  });

  it("skips dispatch when the returning row has no inviter, still ok", async () => {
    const supabase = makeSupabase({
      results: {
        "table:crew_members": {
          data: { invited_by: null, crew_id: CREW_1, crew: null },
        },
      },
    });
    const result = await acceptCrewInvite({
      supabase,
      actorId: USER_A,
      crewMemberId: "invite-1",
    });
    expect(result).toEqual({ ok: true });
    const { notify } = await import("@/lib/notify");
    expect(notify).not.toHaveBeenCalled();
  });

  it("still returns ok if notify dispatch fails — status already flipped", async () => {
    const { notify } = await import("@/lib/notify");
    vi.mocked(notify).mockRejectedValueOnce(new Error("dispatcher boom"));

    const supabase = makeSupabase({
      results: {
        "table:crew_members": {
          data: { invited_by: USER_B, crew_id: CREW_1, crew: { name: "X" } },
        },
        "table:profiles": { data: { username: "alice" } },
      },
    });
    const result = await acceptCrewInvite({
      supabase,
      actorId: USER_A,
      crewMemberId: "invite-1",
    });
    expect(result).toEqual({ ok: true });
  });
});

// ────────────────────────────────────────────────────────────────
// transferCrewOwnership
// ────────────────────────────────────────────────────────────────

describe("transferCrewOwnership", () => {
  it("rejects when the crew is missing", async () => {
    const supabase = makeSupabase({
      results: { "table:crews": { data: null } },
    });
    const result = await transferCrewOwnership({
      supabase,
      actorId: USER_A,
      crewId: CREW_1,
      newOwnerId: USER_B,
    });
    expect(result).toEqual({ error: "Crew not found." });
  });

  it("rejects when caller isn't the current creator", async () => {
    const supabase = makeSupabase({
      results: {
        "table:crews": { data: { created_by: "different-user" } },
      },
    });
    const result = await transferCrewOwnership({
      supabase,
      actorId: USER_A,
      crewId: CREW_1,
      newOwnerId: USER_B,
    });
    expect(result).toEqual({
      error: "Only the current creator can transfer a crew.",
    });
  });

  it("rejects when target isn't an active member", async () => {
    const supabase = makeSupabase({
      results: {
        "table:crews": { data: { created_by: USER_A } },
        "table:crew_members": { data: null },
      },
    });
    const result = await transferCrewOwnership({
      supabase,
      actorId: USER_A,
      crewId: CREW_1,
      newOwnerId: USER_B,
    });
    expect(result).toEqual({
      error: "That climber isn't an active member of this crew.",
    });
  });

  it("happy path: updates created_by, dispatches notification, busts members", async () => {
    const supabase = makeSupabase({
      results: {
        "table:crews": { data: { created_by: USER_A, name: "Tuesday Crew" } },
        "table:crew_members": { data: { id: "row-1" } },
        "table:profiles": { data: { username: "alice" } },
      },
    });
    const result = await transferCrewOwnership({
      supabase,
      actorId: USER_A,
      crewId: CREW_1,
      newOwnerId: USER_B,
    });
    expect(result).toEqual({ ok: true });

    const { notify } = await import("@/lib/notify");
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "crew_ownership_transferred",
        recipient: USER_B,
        actor: USER_A,
        crewId: CREW_1,
        crewName: "Tuesday Crew",
        fromUsername: "alice",
      }),
    );

    const { revalidateTag } = await import("next/cache");
    expect(revalidateTag).toHaveBeenCalledWith(`crew:${CREW_1}`, "max");
  });
});
