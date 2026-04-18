/**
 * Notification server actions — mark-all-read + dismiss.
 *
 * Both actions are RLS-gated (users can only touch their own
 * notification rows), so tests focus on the surface-level contract:
 * auth failures propagate, invalid input rejects, happy path
 * returns success. RLS itself is validated at the SQL layer.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireSignedIn: vi.fn() }));

type SbResult = { data?: unknown; error?: { code?: string; message?: string } | null };

function makeChain(resolve: () => Promise<SbResult> | SbResult) {
  const builder: Record<string, unknown> = {};
  const chain: (...args: unknown[]) => typeof builder = () => builder;
  const methods = ["select", "insert", "update", "delete", "eq", "is", "order", "limit"];
  for (const m of methods) (builder[m] as unknown) = chain;
  builder.then = (onFulfilled: (v: SbResult) => unknown) =>
    Promise.resolve(resolve()).then(onFulfilled);
  return builder;
}

function mockSupabase(results: Record<string, SbResult> = {}) {
  return {
    from: (table: string) =>
      makeChain(() => results[`table:${table}`] ?? { data: null }),
    // `markAllNotificationsRead` now routes through the
    // `mark_all_notifications_read(uuid)` RPC added in migration 053
    // (server-authoritative `now()` stamp). The stub keys by
    // `rpc:<fn_name>` so tests can pin per-RPC results the same way
    // they pin per-table ones.
    rpc: (name: string) => {
      const result = results[`rpc:${name}`] ?? { data: null };
      return Promise.resolve(result);
    },
  };
}

const USER_A = "11111111-1111-1111-1111-111111111111";
const NOTIF_1 = "cccccccc-cccc-cccc-cccc-cccccccccccc";

beforeEach(() => {
  vi.resetAllMocks();
});

describe("markAllNotificationsRead", () => {
  it("surfaces auth failure", async () => {
    const { requireSignedIn } = await import("@/lib/auth");
    vi.mocked(requireSignedIn).mockResolvedValue({ error: "Not signed in" });
    const { markAllNotificationsRead } = await import("./notifications-actions");
    expect(await markAllNotificationsRead()).toEqual({ error: "Not signed in" });
  });

  it("returns success when the update lands", async () => {
    const { requireSignedIn } = await import("@/lib/auth");
    vi.mocked(requireSignedIn).mockResolvedValue({
      supabase: mockSupabase({
        "rpc:mark_all_notifications_read": { data: 1, error: null },
      }) as never,
      userId: USER_A,
    });
    const { markAllNotificationsRead } = await import("./notifications-actions");
    expect(await markAllNotificationsRead()).toEqual({ success: true });
  });

  it("surfaces a friendly message on permission denial", async () => {
    const { requireSignedIn } = await import("@/lib/auth");
    vi.mocked(requireSignedIn).mockResolvedValue({
      supabase: mockSupabase({
        "rpc:mark_all_notifications_read": {
          data: null,
          error: { code: "42501", message: "blocked" },
        },
      }) as never,
      userId: USER_A,
    });
    const { markAllNotificationsRead } = await import("./notifications-actions");
    // 42501 = permission denied; formatError maps to friendly text so
    // raw Postgres "blocked" / details / hint never hit the client.
    expect(await markAllNotificationsRead()).toEqual({
      error: "You don't have permission to do that.",
    });
  });
});

describe("dismissNotification", () => {
  it("rejects malformed UUID", async () => {
    const { dismissNotification } = await import("./notifications-actions");
    expect(await dismissNotification("not-a-uuid")).toEqual({
      error: "Invalid notification",
    });
  });

  it("surfaces auth failure", async () => {
    const { requireSignedIn } = await import("@/lib/auth");
    vi.mocked(requireSignedIn).mockResolvedValue({ error: "Not signed in" });
    const { dismissNotification } = await import("./notifications-actions");
    expect(await dismissNotification(NOTIF_1)).toEqual({ error: "Not signed in" });
  });

  it("returns success on delete", async () => {
    const { requireSignedIn } = await import("@/lib/auth");
    vi.mocked(requireSignedIn).mockResolvedValue({
      supabase: mockSupabase({
        "table:notifications": { data: null, error: null },
      }) as never,
      userId: USER_A,
    });
    const { dismissNotification } = await import("./notifications-actions");
    expect(await dismissNotification(NOTIF_1)).toEqual({ success: true });
  });

  it("surfaces a friendly message on permission denial", async () => {
    const { requireSignedIn } = await import("@/lib/auth");
    vi.mocked(requireSignedIn).mockResolvedValue({
      supabase: mockSupabase({
        "table:notifications": { data: null, error: { code: "42501", message: "blocked" } },
      }) as never,
      userId: USER_A,
    });
    const { dismissNotification } = await import("./notifications-actions");
    expect(await dismissNotification(NOTIF_1)).toEqual({
      error: "You don't have permission to do that.",
    });
  });
});
