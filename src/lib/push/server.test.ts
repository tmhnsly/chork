import { describe, it, expect, vi, beforeEach } from "vitest";

// web-push is noisy to stub globally because the module reads VAPID
// env vars at import time and stashes a module-level configured flag.
// We intercept both `setVapidDetails` (no-op) and `sendNotification`
// (per-test override) so each test can reason about outcomes without
// a real push endpoint.
const sendNotification = vi.fn();
vi.mock("web-push", () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification,
  },
}));

// Service client stub. Each test wires up a fresh chained query
// builder so the "profiles opt-in filter" vs "push_subscriptions
// lookup" vs "push_subscriptions delete" can be distinguished.
const selectFn = vi.fn();
const inFn = vi.fn();
const deleteFn = vi.fn();
const deleteInFn = vi.fn();
const fromFn = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: vi.fn(() => ({ from: fromFn })),
}));

// next/server's `after` runs immediately in tests so we can await the
// work inline.
vi.mock("next/server", () => ({
  after: (cb: () => Promise<void>) => cb(),
}));

beforeEach(() => {
  vi.resetModules();
  sendNotification.mockReset();
  fromFn.mockReset();
  selectFn.mockReset();
  inFn.mockReset();
  deleteFn.mockReset();
  deleteInFn.mockReset();

  // VAPID keys must be set so `configure()` returns true — otherwise
  // every call short-circuits to `{ skipped: true }` before any
  // branch under test runs.
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "BPublicKey";
  process.env.VAPID_PRIVATE_KEY = "priv";
  process.env.VAPID_SUBJECT = "mailto:test@example.com";
});

function wireSubscriptionsLookup(rows: { id: string; endpoint: string; p256dh: string; auth: string }[]) {
  // `from("push_subscriptions").select(...).in("user_id", ids)` →
  // { data: rows, error: null }. Cover both the select() -> in()
  // chain and the later delete().in() chain.
  const chain = {
    select: vi.fn(() => chain),
    in: vi.fn(() => Promise.resolve({ data: rows, error: null })),
    delete: vi.fn(() => ({
      in: vi.fn(() => Promise.resolve({ error: null })),
    })),
  };
  return chain;
}

describe("sendPushToUsers", () => {
  it("returns `{ skipped: true }` when VAPID keys are missing", async () => {
    delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    const { sendPushToUsers } = await import("./server");
    const result = await sendPushToUsers(["u1"], { title: "t", body: "b" });
    expect(result).toEqual({ skipped: true });
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("filters recipients by opt-in column when a category is provided", async () => {
    // Two recipients: u1 opted in, u2 opted out. Push should only
    // land on u1's endpoint — respecting the privacy contract that
    // unchecking `push_invite_received` turns that whole category off.
    const profilesChain = {
      select: vi.fn(() => profilesChain),
      in: vi.fn(() =>
        Promise.resolve({
          data: [
            { id: "u1", push_invite_received: true },
            { id: "u2", push_invite_received: false },
          ],
          error: null,
        }),
      ),
    };
    const subsChain = wireSubscriptionsLookup([
      { id: "s1", endpoint: "https://push/u1", p256dh: "p", auth: "a" },
    ]);

    fromFn.mockImplementation((table: string) => {
      if (table === "profiles") return profilesChain;
      if (table === "push_subscriptions") return subsChain;
      throw new Error(`unexpected table ${table}`);
    });
    sendNotification.mockResolvedValue(undefined);

    const { sendPushToUsers } = await import("./server");
    const result = await sendPushToUsers(
      ["u1", "u2"],
      { title: "Invite", body: "x" },
      { category: "invite_received" },
    );

    expect(result).toEqual({ sent: 1, removed: 0 });
    // u1's subscription got one call, u2 was filtered out before the
    // subscriptions lookup.
    expect(subsChain.in).toHaveBeenCalledWith("user_id", ["u1"]);
    expect(sendNotification).toHaveBeenCalledTimes(1);
  });

  it("evicts 404 / 410 subscriptions as it discovers them", async () => {
    // A 410 (Gone) from a push service is the definitive "this
    // endpoint is dead" signal. The queue must garbage-collect or
    // we'll re-try against the same dead endpoint on every future
    // push, slowing every dispatch and stuffing logs.
    const subsChain = wireSubscriptionsLookup([
      { id: "s-live", endpoint: "https://push/live", p256dh: "p", auth: "a" },
      { id: "s-dead", endpoint: "https://push/dead", p256dh: "p", auth: "a" },
    ]);
    let deleteCalledWith: string[] | null = null;
    subsChain.delete = vi.fn(() => ({
      in: vi.fn((_col: string, ids: string[]) => {
        deleteCalledWith = ids;
        return Promise.resolve({ error: null });
      }),
    }));

    fromFn.mockImplementation((table: string) => {
      if (table === "push_subscriptions") return subsChain;
      throw new Error(`unexpected table ${table}`);
    });

    sendNotification.mockImplementation((sub: { endpoint: string }) => {
      if (sub.endpoint.includes("dead")) {
        const err = new Error("gone") as Error & { statusCode: number };
        err.statusCode = 410;
        return Promise.reject(err);
      }
      return Promise.resolve(undefined);
    });

    const { sendPushToUsers } = await import("./server");
    const result = await sendPushToUsers(["u1"], { title: "t", body: "b" });

    expect(result).toEqual({ sent: 1, removed: 1 });
    expect(deleteCalledWith).toEqual(["s-dead"]);
  });
});
