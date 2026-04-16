import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock all dependencies before importing the module under test
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: vi.fn(),
  createServiceClient: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({
  requireAuth: vi.fn(),
  requireSignedIn: vi.fn(),
}));
vi.mock("@/lib/data/mutations", () => ({
  upsertRouteLog: vi.fn(),
  createActivityEvent: vi.fn(),
  deleteCompletionEvents: vi.fn(),
  createComment: vi.fn(),
  updateComment: vi.fn(),
  toggleCommentLike: vi.fn(),
}));
vi.mock("@/lib/data/queries", () => ({
  getCommentsByRoute: vi.fn(),
  getRouteGrade: vi.fn(),
  getLikedCommentIds: vi.fn(),
}));

const mockAuth = { supabase: {} as never, userId: "user1", gymId: "gym1" };
const mockLog = { id: "log1", user_id: "user1", route_id: "r1", attempts: 3, completed: true, completed_at: "2026-01-01", grade_vote: null, zone: false, gym_id: "gym1", created_at: "2026-01-01", updated_at: "2026-01-01" };

beforeEach(() => {
  vi.resetAllMocks();
});

describe("completeRoute", () => {
  it("rejects empty routeId", async () => {
    const { completeRoute } = await import("./actions");
    const result = await completeRoute("", 3, null, false);
    expect(result).toHaveProperty("error", "Invalid route");
  });

  it("rejects attempts of 0", async () => {
    const { completeRoute } = await import("./actions");
    const result = await completeRoute("route1", 0, null, false);
    expect(result).toHaveProperty("error", "Invalid attempts");
  });

  it("rejects gradeVote out of range", async () => {
    const { completeRoute } = await import("./actions");
    const result = await completeRoute("route1", 3, 31, false);
    expect(result).toHaveProperty("error", "Invalid grade");
  });

  it("returns error when auth fails", async () => {
    const { requireAuth } = await import("@/lib/auth");
    vi.mocked(requireAuth).mockResolvedValue({ error: "Not signed in" });

    const { completeRoute } = await import("./actions");
    const result = await completeRoute("route1", 3, null, false);
    expect(result).toHaveProperty("error", "Not signed in");
  });

  it("creates flashed activity event for 1 attempt", async () => {
    const { requireAuth } = await import("@/lib/auth");
    vi.mocked(requireAuth).mockResolvedValue(mockAuth);

    const { upsertRouteLog, createActivityEvent } = await import("@/lib/data/mutations");
    vi.mocked(upsertRouteLog).mockResolvedValue(mockLog);
    vi.mocked(createActivityEvent).mockResolvedValue({} as never);

    const { completeRoute } = await import("./actions");
    await completeRoute("route1", 1, null, false);

    expect(createActivityEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: "flashed" })
    );
  });

  it("creates completed activity event for 2+ attempts", async () => {
    const { requireAuth } = await import("@/lib/auth");
    vi.mocked(requireAuth).mockResolvedValue(mockAuth);

    const { upsertRouteLog, createActivityEvent } = await import("@/lib/data/mutations");
    vi.mocked(upsertRouteLog).mockResolvedValue(mockLog);
    vi.mocked(createActivityEvent).mockResolvedValue({} as never);

    const { completeRoute } = await import("./actions");
    await completeRoute("route1", 3, null, false);

    expect(createActivityEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: "completed" })
    );
  });
});

describe("updateGradeVote", () => {
  it("rejects missing logId", async () => {
    const { updateGradeVote } = await import("./actions");
    const result = await updateGradeVote("route1", 5, "");
    expect(result).toHaveProperty("error", "Invalid log");
  });

  it("rejects a missing route id", async () => {
    const { updateGradeVote } = await import("./actions");
    expect(await updateGradeVote("", 5, "log1")).toHaveProperty("error", "Invalid route");
  });

  it.each([-1, 31, 2.5, Number.NaN])(
    "rejects out-of-range / non-integer grade (%s)",
    async (grade) => {
      const { updateGradeVote } = await import("./actions");
      expect(await updateGradeVote("route1", grade, "log1")).toHaveProperty(
        "error",
        "Invalid grade",
      );
    },
  );

  it("accepts a valid grade (0..30) and writes it to the log", async () => {
    const { requireAuth } = await import("@/lib/auth");
    vi.mocked(requireAuth).mockResolvedValue(mockAuth);

    const { upsertRouteLog } = await import("@/lib/data/mutations");
    vi.mocked(upsertRouteLog).mockResolvedValue(mockLog);

    const { updateGradeVote } = await import("./actions");
    const result = await updateGradeVote("route1", 4, "log1");

    expect(result).toEqual({ success: true, log: mockLog });
    expect(upsertRouteLog).toHaveBeenCalledWith(
      expect.anything(),
      mockAuth.userId,
      "route1",
      { grade_vote: 4 },
      "log1",
      mockAuth.gymId,
    );
  });

  // Removing a vote: the UI sends `null` when the climber toggles
  // grading off. Persisting null means the DB's `get_route_grade`
  // RPC — which filters `grade_vote is not null` — drops this row
  // from the community-grade average. Anti-regression guard: if a
  // future change rewrites the action to skip null writes, the
  // community grade would stay artificially inflated by retired
  // votes.
  it("accepts `null` and writes it through so the vote is removed", async () => {
    const { requireAuth } = await import("@/lib/auth");
    vi.mocked(requireAuth).mockResolvedValue(mockAuth);

    const { upsertRouteLog } = await import("@/lib/data/mutations");
    vi.mocked(upsertRouteLog).mockResolvedValue(mockLog);

    const { updateGradeVote } = await import("./actions");
    const result = await updateGradeVote("route1", null, "log1");

    expect(result).toEqual({ success: true, log: mockLog });
    expect(upsertRouteLog).toHaveBeenCalledWith(
      expect.anything(),
      mockAuth.userId,
      "route1",
      { grade_vote: null },
      "log1",
      mockAuth.gymId,
    );
  });

  it("does NOT create an activity event", async () => {
    const { requireAuth } = await import("@/lib/auth");
    vi.mocked(requireAuth).mockResolvedValue(mockAuth);

    const { upsertRouteLog, createActivityEvent } = await import("@/lib/data/mutations");
    vi.mocked(upsertRouteLog).mockResolvedValue(mockLog);

    const { updateGradeVote } = await import("./actions");
    await updateGradeVote("route1", 5, "log1");

    expect(createActivityEvent).not.toHaveBeenCalled();
  });
});

// `uncompleteRoute` needs to null the climber's `grade_vote` so it
// stops contributing to the community average — otherwise a climber
// who uncompletes a route would keep influencing its grade without
// actually having the route marked as sent.
describe("uncompleteRoute grade-vote cleanup", () => {
  it("clears grade_vote when uncompleting", async () => {
    const { requireAuth } = await import("@/lib/auth");
    vi.mocked(requireAuth).mockResolvedValue(mockAuth);

    const { upsertRouteLog } = await import("@/lib/data/mutations");
    vi.mocked(upsertRouteLog).mockResolvedValue(mockLog);

    const { uncompleteRoute } = await import("./actions");
    await uncompleteRoute("route1", "log1");

    expect(upsertRouteLog).toHaveBeenCalledWith(
      expect.anything(),
      mockAuth.userId,
      "route1",
      expect.objectContaining({ grade_vote: null }),
      "log1",
      mockAuth.gymId,
    );
  });
});

describe("editComment", () => {
  it("rejects empty body after trim", async () => {
    const { editComment } = await import("./actions");
    const result = await editComment("c1", "   ");
    expect(result).toHaveProperty("error");
  });

  it("rejects body over 500 chars", async () => {
    const { editComment } = await import("./actions");
    const result = await editComment("c1", "x".repeat(501));
    expect(result).toHaveProperty("error");
  });
});

describe("postComment", () => {
  it("rejects body over 500 chars", async () => {
    const { postComment } = await import("./actions");
    const result = await postComment("route1", "x".repeat(501));
    expect(result).toHaveProperty("error", "Comments must be 500 characters or less");
  });

  it("creates activity event on success", async () => {
    const { requireAuth } = await import("@/lib/auth");
    vi.mocked(requireAuth).mockResolvedValue(mockAuth);

    const { createComment, createActivityEvent } = await import("@/lib/data/mutations");
    vi.mocked(createComment).mockResolvedValue({ id: "c1" } as never);
    vi.mocked(createActivityEvent).mockResolvedValue({} as never);

    const { postComment } = await import("./actions");
    await postComment("route1", "good beta");

    expect(createActivityEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: "beta_spray" })
    );
  });
});
