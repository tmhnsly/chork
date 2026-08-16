import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));
vi.mock("@/lib/push/server", () => ({ sendPushInBackground: vi.fn() }));

const rpc = vi.fn().mockResolvedValue({ error: null });
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => ({ rpc }),
}));

import { notify } from "./notify";

const USER_A = "11111111-1111-1111-1111-111111111111";
const USER_B = "22222222-2222-2222-2222-222222222222";
const FRIEND_1 = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

beforeEach(() => {
  vi.clearAllMocks();
  rpc.mockResolvedValue({ error: null });
});

describe("notify", () => {
  it("friend_request_received: writes log row + fires push with composed body", async () => {
    const { sendPushInBackground } = await import("@/lib/push/server");
    const { revalidateTag } = await import("next/cache");

    await notify({
      kind: "friend_request_received",
      recipient: USER_B,
      actor: USER_A,
      friendId: FRIEND_1,
      fromUsername: "alice",
    });

    expect(rpc).toHaveBeenCalledWith(
      "notify_user",
      expect.objectContaining({
        p_user_id: USER_B,
        p_kind: "friend_request_received",
        p_payload: expect.objectContaining({
          friend_id: FRIEND_1,
          from_username: "alice",
        }),
      }),
    );
    expect(sendPushInBackground).toHaveBeenCalledWith(
      [USER_B],
      {
        title: "New friend request",
        body: "@alice wants to be friends.",
        url: "/friends",
        // Per-kind tray tag: repeats of one kind coalesce, different
        // kinds stay separate. sw.js has always read this field;
        // nothing set it until 2026-08, so every notification shared
        // the generic fallback tag and collapsed into one entry.
        tag: "chork-friend_request_received",
      },
      // Reuses crew's opt-in category — the columns outlived crews
      // because "tell me when someone asks" is the same preference.
      { category: "invite_received" },
    );
    // No cache bust: the inbox is read via an uncached server action
    // (reader-first rule, cache/tags.ts).
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("friend_request_accepted: names who accepted", async () => {
    const { sendPushInBackground } = await import("@/lib/push/server");

    await notify({
      kind: "friend_request_accepted",
      recipient: USER_A,
      actor: USER_B,
      accepterUsername: "bob",
    });

    expect(sendPushInBackground).toHaveBeenCalledWith(
      [USER_A],
      expect.objectContaining({
        title: "You're friends",
        body: "@bob accepted your friend request.",
        url: "/friends",
      }),
      { category: "invite_accepted" },
    );
  });

  it("self-skip: no log, no push when actor === recipient", async () => {
    const { sendPushInBackground } = await import("@/lib/push/server");

    await notify({
      kind: "friend_request_accepted",
      recipient: USER_A,
      actor: USER_A,
      accepterUsername: "alice",
    });

    expect(rpc).not.toHaveBeenCalled();
    expect(sendPushInBackground).not.toHaveBeenCalled();
  });

  it("does not throw when the log RPC errors — push still fires", async () => {
    const { sendPushInBackground } = await import("@/lib/push/server");
    rpc.mockResolvedValueOnce({ error: { code: "42501", message: "denied" } });

    await expect(
      notify({
        kind: "friend_request_received",
        recipient: USER_B,
        actor: USER_A,
        friendId: FRIEND_1,
        fromUsername: "alice",
      }),
    ).resolves.toBeUndefined();

    // Push is best-effort and independent of the log row write.
    expect(sendPushInBackground).toHaveBeenCalled();
  });

  it("does not throw when the log RPC throws synchronously", async () => {
    rpc.mockImplementationOnce(() => {
      throw new Error("network");
    });

    await expect(
      notify({
        kind: "friend_request_received",
        recipient: USER_B,
        actor: USER_A,
        friendId: FRIEND_1,
        fromUsername: "alice",
      }),
    ).resolves.toBeUndefined();
  });

  it("does not throw when sendPushInBackground throws (after() outside scope)", async () => {
    const { sendPushInBackground } = await import("@/lib/push/server");
    vi.mocked(sendPushInBackground).mockImplementationOnce(() => {
      throw new Error("after() outside request scope");
    });

    await expect(
      notify({
        kind: "friend_request_received",
        recipient: USER_B,
        actor: USER_A,
        friendId: FRIEND_1,
        fromUsername: "alice",
      }),
    ).resolves.toBeUndefined();
  });
});
