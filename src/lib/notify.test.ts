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
const CREW_1 = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

beforeEach(() => {
  vi.clearAllMocks();
  rpc.mockResolvedValue({ error: null });
});

describe("notify", () => {
  it("crew_invite_received: writes log row + fires push with composed body", async () => {
    const { sendPushInBackground } = await import("@/lib/push/server");
    const { revalidateTag } = await import("next/cache");

    await notify({
      kind: "crew_invite_received",
      recipient: USER_B,
      actor: USER_A,
      crewId: CREW_1,
      crewName: "Tuesday Crew",
      inviteId: "i1",
      inviterUsername: "alice",
    });

    expect(rpc).toHaveBeenCalledWith(
      "notify_user",
      expect.objectContaining({
        p_user_id: USER_B,
        p_kind: "crew_invite_received",
        p_payload: expect.objectContaining({
          crew_id: CREW_1,
          crew_name: "Tuesday Crew",
          invite_id: "i1",
          inviter_username: "alice",
        }),
      }),
    );
    expect(sendPushInBackground).toHaveBeenCalledWith(
      [USER_B],
      {
        title: "New crew invite",
        body: "@alice invited you to Tuesday Crew.",
        url: "/crew",
      },
      { category: "invite_received" },
    );
    expect(revalidateTag).toHaveBeenCalledWith(
      `user:${USER_B}:notifications`,
      "max",
    );
  });

  it("crew_invite_accepted: composes title with accepter username", async () => {
    const { sendPushInBackground } = await import("@/lib/push/server");

    await notify({
      kind: "crew_invite_accepted",
      recipient: USER_A,
      actor: USER_B,
      crewId: CREW_1,
      crewName: "Tuesday Crew",
      accepterUsername: "bob",
    });

    expect(sendPushInBackground).toHaveBeenCalledWith(
      [USER_A],
      expect.objectContaining({
        title: "Invite accepted",
        body: "@bob joined Tuesday Crew.",
      }),
      { category: "invite_accepted" },
    );
  });

  it("crew_ownership_transferred: push url targets the specific crew", async () => {
    const { sendPushInBackground } = await import("@/lib/push/server");

    await notify({
      kind: "crew_ownership_transferred",
      recipient: USER_B,
      actor: USER_A,
      crewId: CREW_1,
      crewName: "Tuesday Crew",
      fromUsername: "alice",
    });

    expect(sendPushInBackground).toHaveBeenCalledWith(
      [USER_B],
      expect.objectContaining({
        title: "You're now the crew creator",
        url: `/crew/${CREW_1}`,
      }),
      { category: "ownership_changed" },
    );
  });

  it("self-skip: no log, no push when actor === recipient", async () => {
    const { sendPushInBackground } = await import("@/lib/push/server");

    await notify({
      kind: "crew_invite_accepted",
      recipient: USER_A,
      actor: USER_A,
      crewId: CREW_1,
      crewName: "Tuesday Crew",
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
        kind: "crew_invite_received",
        recipient: USER_B,
        actor: USER_A,
        crewId: CREW_1,
        crewName: "Tuesday Crew",
        inviteId: "i1",
        inviterUsername: "alice",
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
        kind: "crew_invite_received",
        recipient: USER_B,
        actor: USER_A,
        crewId: CREW_1,
        crewName: "Tuesday Crew",
        inviteId: "i1",
        inviterUsername: "alice",
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
        kind: "crew_invite_received",
        recipient: USER_B,
        actor: USER_A,
        crewId: CREW_1,
        crewName: "Tuesday Crew",
        inviteId: "i1",
        inviterUsername: "alice",
      }),
    ).resolves.toBeUndefined();
  });
});
