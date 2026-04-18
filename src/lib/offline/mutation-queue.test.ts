import { describe, it, expect, vi, beforeEach } from "vitest";

// Minimal in-memory stand-in for the idb wrapper the queue hits.
// We don't need cross-index behaviour here — just enough to hold
// entries and let the queue iterate them in created-at order.
interface FakeEntry {
  id: string;
  userId: string;
  action: string;
  args: unknown[];
  routeId: string;
  createdAt: number;
  retries: number;
}

function fakeDB() {
  const entries = new Map<string, FakeEntry>();
  return {
    entries,
    put: vi.fn(async (_store: string, entry: FakeEntry) => {
      entries.set(entry.id, entry);
    }),
    delete: vi.fn(async (_store: string, id: string) => {
      entries.delete(id);
    }),
    getAllFromIndex: vi.fn(async (_store: string, index: string, key?: string) => {
      const all = Array.from(entries.values());
      if (index === "userId" && key) {
        return all.filter((e) => e.userId === key);
      }
      if (index === "routeId" && key) {
        return all.filter((e) => e.routeId === key);
      }
      // "createdAt" — sort ascending to mimic idb index ordering
      return [...all].sort((a, b) => a.createdAt - b.createdAt);
    }),
    count: vi.fn(async () => entries.size),
    transaction: vi.fn(() => ({
      store: {
        delete: vi.fn(async (id: string) => {
          entries.delete(id);
        }),
      },
      done: Promise.resolve(),
    })),
  };
}

vi.mock("./db", () => {
  const db = fakeDB();
  return {
    STORE_NAME: "mutations",
    openOfflineDB: vi.fn(async () => db),
    __db: db,
  };
});

// Node's vitest env has no `navigator` global. The flush loop checks
// `navigator.onLine` and treats `undefined` as offline → breaks out
// before firing the runner. Stub it for the suite so the online path
// is the one under test.
beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal("navigator", { onLine: true });
});

async function loadQueue() {
  // Re-import after resetModules so the module-level singleton is
  // fresh between tests.
  const mod = await import("./mutation-queue");
  const dbMod = (await import("./db")) as unknown as {
    __db: ReturnType<typeof fakeDB>;
  };
  dbMod.__db.entries.clear();
  return { queue: mod.mutationQueue, fakeDb: dbMod.__db };
}

describe("MutationQueue flush", () => {
  it("stops flushing on the auth sentinel and keeps remaining entries queued", async () => {
    const { AUTH_REQUIRED_ERROR } = await import("@/lib/auth-errors");
    const { queue, fakeDb } = await loadQueue();

    queue.setCurrentUserResolver(async () => "user-a");

    // Pretend the server action returns the auth sentinel for the
    // first call, then would succeed for the second. The queue
    // should break immediately after the first response and never
    // invoke the runner for the second — otherwise we'd be firing
    // every queued write under anonymous cookies after signout.
    const runner = vi
      .fn()
      .mockResolvedValueOnce({ error: AUTH_REQUIRED_ERROR })
      .mockResolvedValueOnce({ log: { id: "l1" } });
    queue.setActionRunner(runner as never);

    await queue.enqueue({
      action: "updateAttempts",
      args: ["route-1", 2],
      routeId: "route-1",
    });
    await queue.enqueue({
      action: "updateAttempts",
      args: ["route-2", 3],
      routeId: "route-2",
    });

    expect(fakeDb.entries.size).toBe(2);

    await queue.flush();

    // Exactly one runner call — the sentinel on call #1 breaks the
    // loop. Both entries remain in the queue for the next flush.
    expect(runner).toHaveBeenCalledTimes(1);
    expect(fakeDb.entries.size).toBe(2);
  });

  it("compacts repeat updateAttempts for the same route to keep the queue flat", async () => {
    const { queue, fakeDb } = await loadQueue();
    queue.setCurrentUserResolver(async () => "user-a");
    queue.setActionRunner(vi.fn() as never);

    await queue.enqueue({
      action: "updateAttempts",
      args: ["route-1", 1],
      routeId: "route-1",
    });
    await queue.enqueue({
      action: "updateAttempts",
      args: ["route-1", 2],
      routeId: "route-1",
    });
    await queue.enqueue({
      action: "updateAttempts",
      args: ["route-1", 3],
      routeId: "route-1",
    });

    // Last-write-wins for updateAttempts on the same route.
    expect(fakeDb.entries.size).toBe(1);
    const [entry] = [...fakeDb.entries.values()];
    expect(entry.args[1]).toBe(3);
  });

  it("does not run entries belonging to a different user", async () => {
    // Shared-device scenario: user A queues a write, user B signs
    // in. Queue must never post A's writes under B's cookies.
    const { queue, fakeDb } = await loadQueue();
    queue.setCurrentUserResolver(async () => "user-a");

    const runner = vi.fn().mockResolvedValue({ log: { id: "ok" } });
    queue.setActionRunner(runner as never);

    await queue.enqueue({
      action: "updateAttempts",
      args: ["route-a", 1],
      routeId: "route-a",
    });

    // Swap signed-in user mid-session
    queue.setCurrentUserResolver(async () => "user-b");
    await queue.flush();

    expect(runner).not.toHaveBeenCalled();
    // A's entry stays — clearForUser during signout handles cleanup.
    expect(fakeDb.entries.size).toBe(1);
  });
});
