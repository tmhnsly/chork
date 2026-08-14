import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the service client before importing mutations
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: vi.fn(),
}));

import { createMockSupabase } from "@/test/mock-supabase";

describe("upsertRouteLog", () => {
  beforeEach(() => vi.resetModules());

  it("includes user_id + gym_id ownership check on update path", async () => {
    const mock = createMockSupabase();
    mock._resolveWith({ data: { id: "log1" }, error: null });

    const { upsertRouteLog } = await import("./mutations");
    await upsertRouteLog(mock as never, "user1", "route1", { attempts: 3 }, "log1", "gym1");

    expect(
      mock.calls.some((c) => c.source === "route_logs" && c.method === "update"),
    ).toBe(true);
    const eqArgs = mock.calls
      .filter((c) => c.source === "route_logs" && c.method === "eq")
      .map((c) => c.args);
    expect(eqArgs).toContainEqual(["id", "log1"]);
    expect(eqArgs).toContainEqual(["user_id", "user1"]);
    expect(eqArgs).toContainEqual(["gym_id", "gym1"]);
  });

  it("throws when gymId is missing on update path", async () => {
    const mock = createMockSupabase();
    const { upsertRouteLog } = await import("./mutations");
    await expect(
      upsertRouteLog(mock as never, "user1", "route1", { attempts: 3 }, "log1")
    ).rejects.toThrow("gym_id is required");
  });

  it("throws when gymId is missing on create path", async () => {
    const mock = createMockSupabase();
    const { upsertRouteLog } = await import("./mutations");

    await expect(
      upsertRouteLog(mock as never, "user1", "route1", { attempts: 1 }, undefined, null)
    ).rejects.toThrow("gym_id is required");
  });

  it("uses upsert with onConflict on create path", async () => {
    const mock = createMockSupabase();
    mock._resolveWith({ data: { id: "new" }, error: null });

    const { upsertRouteLog } = await import("./mutations");
    await upsertRouteLog(mock as never, "user1", "route1", { attempts: 1 }, undefined, "gym1");

    const upsert = mock.calls.find(
      (c) => c.source === "route_logs" && c.method === "upsert",
    );
    expect(upsert?.args).toEqual([
      expect.objectContaining({ user_id: "user1", route_id: "route1", gym_id: "gym1" }),
      { onConflict: "user_id,route_id" },
    ]);
  });

  it("throws on Supabase error", async () => {
    const mock = createMockSupabase();
    mock._resolveWith({ data: null, error: { message: "DB error" } });

    const { upsertRouteLog } = await import("./mutations");
    await expect(
      upsertRouteLog(mock as never, "user1", "route1", { attempts: 1 }, "log1", "gym1")
    ).rejects.toBeDefined();
  });
});

describe("createGymMembership", () => {
  it("rejects invalid role", async () => {
    const mock = createMockSupabase();
    const { createGymMembership } = await import("./mutations");

    await expect(
      createGymMembership(mock as never, "user1", "gym1", "superadmin" as never)
    ).rejects.toThrow("Invalid role");
  });

  it("defaults to climber role", async () => {
    const mock = createMockSupabase();
    mock._resolveWith({ data: null, error: null });

    const { createGymMembership } = await import("./mutations");
    // insert is void on success - just verify it doesn't throw
    await createGymMembership(mock as never, "user1", "gym1");

    const insert = mock.calls.find(
      (c) => c.source === "gym_memberships" && c.method === "insert",
    );
    expect(insert?.args).toEqual([expect.objectContaining({ role: "climber" })]);
  });
});

describe("toggleCommentLike", () => {
  it("deletes the like row and returns the trigger-maintained count", async () => {
    // comments.likes is maintained by the comment_likes trigger
    // (migration 068), not an RPC — the action just re-reads the count.
    const userMock = createMockSupabase();
    userMock._resolveWith({ data: { id: "like1", likes: 4 }, error: null });

    const { toggleCommentLike } = await import("./mutations");
    const result = await toggleCommentLike(userMock as never, "user1", "comment1", "gym1");

    expect(result).toEqual({ liked: false, likes: 4 });
    expect(
      userMock.calls.some((c) => c.source === "comment_likes" && c.method === "delete"),
    ).toBe(true);
  });

  it("inserts the like row and returns the trigger-maintained count", async () => {
    const userMock = createMockSupabase();
    userMock._resolveWith({ data: null, error: null });

    const { toggleCommentLike } = await import("./mutations");
    const result = await toggleCommentLike(userMock as never, "user1", "comment1", "gym1");

    expect(result.liked).toBe(true);
    const insert = userMock.calls.find(
      (c) => c.source === "comment_likes" && c.method === "insert",
    );
    expect(insert?.args).toEqual([
      expect.objectContaining({ user_id: "user1", comment_id: "comment1", gym_id: "gym1" }),
    ]);
  });

  it("throws instead of guessing when the like-state read is blocked", async () => {
    const userMock = createMockSupabase();
    userMock._resolveWith({ data: null, error: { message: "RLS" } });

    const { toggleCommentLike } = await import("./mutations");
    await expect(
      toggleCommentLike(userMock as never, "user1", "comment1", "gym1"),
    ).rejects.toBeTruthy();
  });
});
