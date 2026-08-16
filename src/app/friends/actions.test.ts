import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("@/lib/auth", () => ({ gateSignedInMutation: vi.fn() }));
vi.mock("@/lib/notify", () => ({ notify: vi.fn() }));

import { createMockSupabase } from "@/test/mock-supabase";

const ME = "11111111-1111-1111-1111-111111111111";
const THEM = "22222222-2222-2222-2222-222222222222";
const FRIEND_1 = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

beforeEach(() => {
  vi.resetAllMocks();
});

/** Signed in, with the given Supabase double. */
async function signedIn(sb: unknown) {
  const { gateSignedInMutation } = await import("@/lib/auth");
  vi.mocked(gateSignedInMutation).mockResolvedValue({
    supabase: sb,
    userId: ME,
  } as never);
}

describe("requestFriend", () => {
  it("rejects a malformed climber id before touching the database", async () => {
    const { gateSignedInMutation } = await import("@/lib/auth");
    vi.mocked(gateSignedInMutation).mockResolvedValue({
      error: "Invalid climber id",
    });
    const { requestFriend } = await import("./actions");
    expect(await requestFriend("not-a-uuid")).toEqual({
      error: "Invalid climber id",
    });
  });

  it("propagates auth failure", async () => {
    const { gateSignedInMutation } = await import("@/lib/auth");
    vi.mocked(gateSignedInMutation).mockResolvedValue({
      error: "You need to be signed in.",
    });
    const { requestFriend } = await import("./actions");
    expect(await requestFriend(THEM)).toEqual({
      error: "You need to be signed in.",
    });
  });

  it("notifies the target when the ask is new", async () => {
    await signedIn(
      createMockSupabase({
        "rpc:request_friend": {
          data: { id: FRIEND_1, status: "pending", requester_id: ME, addressee_id: THEM },
        },
        "table:profiles": { data: { username: "tom" } },
      }),
    );
    const { requestFriend } = await import("./actions");
    const { notify } = await import("@/lib/notify");

    expect(await requestFriend(THEM)).toEqual({ success: true, status: "pending" });
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "friend_request_received",
        recipient: THEM,
        fromUsername: "tom",
      }),
    );
  });

  it("does NOT notify again when the same ask is repeated", async () => {
    // The RPC is idempotent and returns the existing pending row with
    // the ORIGINAL requester. Pushing on that would mean one tap-tap
    // sends two notifications for one request.
    await signedIn(
      createMockSupabase({
        "rpc:request_friend": {
          data: { id: FRIEND_1, status: "pending", requester_id: THEM, addressee_id: ME },
        },
      }),
    );
    const { requestFriend } = await import("./actions");
    const { notify } = await import("@/lib/notify");

    await requestFriend(THEM);
    expect(notify).not.toHaveBeenCalled();
  });

  it("says nothing when the RPC silently refuses a declined link", async () => {
    // Telling the caller anything here would leak that they were
    // declined rather than ignored — see migration 104.
    await signedIn(
      createMockSupabase({
        "rpc:request_friend": {
          data: { id: FRIEND_1, status: "declined", requester_id: ME, addressee_id: THEM },
        },
      }),
    );
    const { requestFriend } = await import("./actions");
    const { notify } = await import("@/lib/notify");

    const result = await requestFriend(THEM);
    expect(result).toEqual({ success: true, status: "declined" });
    expect(notify).not.toHaveBeenCalled();
  });

  it("maps a Postgres error to a friendly message", async () => {
    await signedIn(
      createMockSupabase({
        "rpc:request_friend": {
          error: { code: "P0002", message: "Climber not found" },
        },
      }),
    );
    const { requestFriend } = await import("./actions");
    const result = await requestFriend(THEM);
    expect(result).toHaveProperty("error");
  });

  it("still succeeds when the push fails", async () => {
    // Push is best-effort; a notification outage must not make the
    // link look like it didn't happen.
    await signedIn(
      createMockSupabase({
        "rpc:request_friend": {
          data: { id: FRIEND_1, status: "pending", requester_id: ME, addressee_id: THEM },
        },
        "table:profiles": { data: { username: "tom" } },
      }),
    );
    const { notify } = await import("@/lib/notify");
    vi.mocked(notify).mockRejectedValue(new Error("web-push down"));

    const { requestFriend } = await import("./actions");
    expect(await requestFriend(THEM)).toEqual({ success: true, status: "pending" });
  });
});

describe("respondToFriend", () => {
  it("reports a request that is no longer open", async () => {
    await signedIn(createMockSupabase({ "rpc:respond_to_friend": { data: null } }));
    const { respondToFriend } = await import("./actions");
    expect(await respondToFriend(FRIEND_1, true)).toEqual({
      error: "That request is no longer open.",
    });
  });

  it("tells the requester when accepted", async () => {
    await signedIn(
      createMockSupabase({
        "rpc:respond_to_friend": {
          data: { id: FRIEND_1, status: "active", requester_id: THEM, addressee_id: ME },
        },
        "table:profiles": { data: { username: "tom" } },
      }),
    );
    const { respondToFriend } = await import("./actions");
    const { notify } = await import("@/lib/notify");

    expect(await respondToFriend(FRIEND_1, true)).toEqual({
      success: true,
      status: "active",
    });
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "friend_request_accepted",
        recipient: THEM,
      }),
    );
  });

  it("declines silently — nobody is told they were turned down", async () => {
    await signedIn(
      createMockSupabase({
        "rpc:respond_to_friend": {
          data: { id: FRIEND_1, status: "declined", requester_id: THEM, addressee_id: ME },
        },
      }),
    );
    const { respondToFriend } = await import("./actions");
    const { notify } = await import("@/lib/notify");

    expect(await respondToFriend(FRIEND_1, false)).toEqual({
      success: true,
      status: "declined",
    });
    expect(notify).not.toHaveBeenCalled();
  });
});

describe("removeFriend", () => {
  it("propagates a database error", async () => {
    await signedIn(
      createMockSupabase({
        "rpc:remove_friend": { error: { code: "42501", message: "denied" } },
      }),
    );
    const { removeFriend } = await import("./actions");
    expect(await removeFriend(THEM)).toHaveProperty("error");
  });

  it("unlinks", async () => {
    await signedIn(createMockSupabase({ "rpc:remove_friend": { data: null } }));
    const { removeFriend } = await import("./actions");
    expect(await removeFriend(THEM)).toEqual({ success: true, ok: true });
  });
});
