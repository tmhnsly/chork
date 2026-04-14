/**
 * Notification server actions — mark-all-read + dismiss.
 *
 * Both actions are RLS-gated (users can only touch their own
 * notification rows), so tests focus on the surface-level contract:
 * auth failures propagate, invalid input rejects, happy path
 * returns success. RLS itself is validated at the SQL layer.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
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
        "table:notifications": { data: null, error: null },
      }) as never,
      userId: USER_A,
    });
    const { markAllNotificationsRead } = await import("./notifications-actions");
    expect(await markAllNotificationsRead()).toEqual({ success: true });
  });

  it("propagates DB errors", async () => {
    const { requireSignedIn } = await import("@/lib/auth");
    vi.mocked(requireSignedIn).mockResolvedValue({
      supabase: mockSupabase({
        "table:notifications": { data: null, error: { code: "42501", message: "blocked" } },
      }) as never,
      userId: USER_A,
    });
    const { markAllNotificationsRead } = await import("./notifications-actions");
    expect(await markAllNotificationsRead()).toEqual({ error: "blocked" });
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

  it("propagates DB errors", async () => {
    const { requireSignedIn } = await import("@/lib/auth");
    vi.mocked(requireSignedIn).mockResolvedValue({
      supabase: mockSupabase({
        "table:notifications": { data: null, error: { code: "42501", message: "blocked" } },
      }) as never,
      userId: USER_A,
    });
    const { dismissNotification } = await import("./notifications-actions");
    expect(await dismissNotification(NOTIF_1)).toEqual({ error: "blocked" });
  });
});
