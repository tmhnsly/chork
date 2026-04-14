/**
 * Admin mutation helpers — service-role writes that the server
 * actions delegate to. Two of these (`createGymWithOwner`,
 * `acceptGymInvite`) include transaction-like rollback + validation
 * paths that are easy to silently regress. Tests pin down:
 *
 *   • unique-slug violation on gym insert → friendly message
 *   • owner-insert failure AFTER gym insert → rolls back the gym
 *   • expired / already-accepted / wrong-email invite paths
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: vi.fn(),
}));

type SbResult = {
  data?: unknown;
  error?: { code?: string; message?: string } | null;
};

function makeChain(resolve: () => SbResult, onCall?: (method: string, args: unknown[]) => void) {
  const builder: Record<string, unknown> = {};
  const chain = (method: string) => (...args: unknown[]) => {
    onCall?.(method, args);
    return builder;
  };
  const methods = [
    "select", "insert", "update", "upsert", "delete",
    "eq", "neq", "order", "limit",
    "maybeSingle", "single",
  ];
  for (const m of methods) (builder[m] as unknown) = chain(m);
  builder.then = (onFulfilled: (v: SbResult) => unknown) =>
    Promise.resolve(resolve()).then(onFulfilled);
  return builder;
}

/** Returns a mock with a per-table result map and a call log. */
function mockService(tables: Record<string, SbResult | SbResult[]>) {
  // Per-table counters so repeated reads/writes to the same table can
  // return different results in sequence (e.g. insert → then rollback
  // delete).
  const cursors: Record<string, number> = {};
  const calls: Array<{ table: string; method: string; args: unknown[] }> = [];

  return {
    client: {
      from: (table: string) => {
        return makeChain(
          () => {
            const entries = tables[`table:${table}`];
            if (Array.isArray(entries)) {
              const i = cursors[table] ?? 0;
              cursors[table] = i + 1;
              return entries[Math.min(i, entries.length - 1)] ?? { data: null };
            }
            return entries ?? { data: null };
          },
          (method, args) => calls.push({ table, method, args }),
        );
      },
    },
    calls,
  };
}

const USER_A = "11111111-1111-1111-1111-111111111111";
const GYM_1 = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

beforeEach(() => {
  vi.resetAllMocks();
});

// ────────────────────────────────────────────────────────────────
// createGymWithOwner
// ────────────────────────────────────────────────────────────────
describe("createGymWithOwner", () => {
  const baseInput = {
    name: "Yonder",
    slug: "yonder",
    city: "London",
    country: "GB",
    plan_tier: "starter" as const,
    ownerUserId: USER_A,
  };

  it("returns a friendly message when the slug is already taken (PG 23505)", async () => {
    const { createServiceClient } = await import("@/lib/supabase/server");
    const { client } = mockService({
      "table:gyms": { data: null, error: { code: "23505", message: "dup" } },
    });
    vi.mocked(createServiceClient).mockReturnValue(client as never);

    const { createGymWithOwner } = await import("./admin-mutations");
    expect(await createGymWithOwner(baseInput)).toEqual({
      error: "That gym slug is already taken.",
    });
  });

  it("rolls the gym back when the owner-admin insert fails", async () => {
    const { createServiceClient } = await import("@/lib/supabase/server");
    const { client, calls } = mockService({
      "table:gyms": [
        { data: { id: GYM_1 }, error: null }, // insert → returns new id
        { data: null, error: null },          // rollback delete
      ],
      "table:gym_admins": {
        data: null,
        error: { code: "xxx", message: "permission denied" },
      },
    });
    vi.mocked(createServiceClient).mockReturnValue(client as never);

    const { createGymWithOwner } = await import("./admin-mutations");
    const result = await createGymWithOwner(baseInput);
    expect(result).toEqual({ error: "permission denied" });

    // Rollback must have deleted the gym we just created so there's
    // no orphan without an owner.
    const gymCalls = calls.filter((c) => c.table === "gyms");
    const deleteCalls = gymCalls.filter((c) => c.method === "delete");
    expect(deleteCalls.length).toBeGreaterThan(0);
  });

  it("returns the new gym id on full success", async () => {
    const { createServiceClient } = await import("@/lib/supabase/server");
    const { client } = mockService({
      "table:gyms": { data: { id: GYM_1 }, error: null },
      "table:gym_admins": { data: null, error: null },
    });
    vi.mocked(createServiceClient).mockReturnValue(client as never);

    const { createGymWithOwner } = await import("./admin-mutations");
    expect(await createGymWithOwner(baseInput)).toEqual({ gymId: GYM_1 });
  });
});

// ────────────────────────────────────────────────────────────────
// acceptGymInvite
// ────────────────────────────────────────────────────────────────
describe("acceptGymInvite", () => {
  const baseInput = {
    token: "abc123",
    acceptingUserId: USER_A,
    acceptingEmail: "tom@chork.test",
  };

  it("returns 'Invite not found' when token doesn't resolve", async () => {
    const { createServiceClient } = await import("@/lib/supabase/server");
    const { client } = mockService({
      "table:gym_invites": { data: null, error: null },
    });
    vi.mocked(createServiceClient).mockReturnValue(client as never);

    const { acceptGymInvite } = await import("./admin-mutations");
    expect(await acceptGymInvite(baseInput)).toEqual({
      error: "Invite not found.",
    });
  });

  it("rejects already-accepted invites", async () => {
    const { createServiceClient } = await import("@/lib/supabase/server");
    const { client } = mockService({
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
    vi.mocked(createServiceClient).mockReturnValue(client as never);

    const { acceptGymInvite } = await import("./admin-mutations");
    expect(await acceptGymInvite(baseInput)).toEqual({
      error: "This invite has already been used.",
    });
  });

  it("rejects expired invites", async () => {
    const { createServiceClient } = await import("@/lib/supabase/server");
    const { client } = mockService({
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
    vi.mocked(createServiceClient).mockReturnValue(client as never);

    const { acceptGymInvite } = await import("./admin-mutations");
    expect(await acceptGymInvite(baseInput)).toEqual({
      error: "This invite has expired.",
    });
  });

  it("rejects invites addressed to a different email", async () => {
    const { createServiceClient } = await import("@/lib/supabase/server");
    const { client } = mockService({
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
    vi.mocked(createServiceClient).mockReturnValue(client as never);

    const { acceptGymInvite } = await import("./admin-mutations");
    expect(await acceptGymInvite(baseInput)).toEqual({
      error: "This invite was issued to a different email address.",
    });
  });

  it("matches emails case-insensitively on the happy path", async () => {
    const { createServiceClient } = await import("@/lib/supabase/server");
    const { client } = mockService({
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
    });
    vi.mocked(createServiceClient).mockReturnValue(client as never);

    const { acceptGymInvite } = await import("./admin-mutations");
    const res = await acceptGymInvite({ ...baseInput, acceptingEmail: "tom@CHORK.test" });
    expect(res).toEqual({ gymId: GYM_1, role: "admin" });
  });
});
