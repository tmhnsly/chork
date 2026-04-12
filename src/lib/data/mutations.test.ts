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

    expect(mock.update).toHaveBeenCalled();
    expect(mock.eq).toHaveBeenCalledWith("id", "log1");
    expect(mock.eq).toHaveBeenCalledWith("user_id", "user1");
    expect(mock.eq).toHaveBeenCalledWith("gym_id", "gym1");
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

    expect(mock.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: "user1", route_id: "route1", gym_id: "gym1" }),
      { onConflict: "user_id,route_id" }
    );
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

    expect(mock.insert).toHaveBeenCalledWith(
      expect.objectContaining({ role: "climber" })
    );
  });
});

describe("toggleCommentLike", () => {
  it("deletes existing like and decrements count", async () => {
    const { createServiceClient } = await import("@/lib/supabase/server");
    const serviceMock = createMockSupabase();
    serviceMock._resolveWith({ data: 4, error: null });
    vi.mocked(createServiceClient).mockReturnValue(serviceMock as never);

    const userMock = createMockSupabase();
    // First call: maybeSingle returns existing like
    userMock._resolveWith({ data: { id: "like1" }, error: null });

    const { toggleCommentLike } = await import("./mutations");
    const result = await toggleCommentLike(userMock as never, "user1", "comment1", "gym1");

    expect(result.liked).toBe(false);
    expect(userMock.delete).toHaveBeenCalled();
    expect(serviceMock.rpc).toHaveBeenCalledWith(
      "increment_comment_likes",
      { p_comment_id: "comment1", p_delta: -1 }
    );
  });

  it("inserts new like and increments count", async () => {
    const { createServiceClient } = await import("@/lib/supabase/server");
    const serviceMock = createMockSupabase();
    serviceMock._resolveWith({ data: 6, error: null });
    vi.mocked(createServiceClient).mockReturnValue(serviceMock as never);

    const userMock = createMockSupabase();
    // maybeSingle returns null (no existing like)
    userMock._resolveWith({ data: null, error: null });

    const { toggleCommentLike } = await import("./mutations");
    const result = await toggleCommentLike(userMock as never, "user1", "comment1", "gym1");

    expect(result.liked).toBe(true);
    expect(userMock.insert).toHaveBeenCalled();
    expect(serviceMock.rpc).toHaveBeenCalledWith(
      "increment_comment_likes",
      { p_comment_id: "comment1", p_delta: 1 }
    );
  });
});
