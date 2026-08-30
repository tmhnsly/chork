/**
 * Comment server actions — body validation and the activity event a
 * post leaves behind. Route-log coverage that used to sit beside these
 * behind the `(app)/actions.ts` barrel lives in
 * `route-log-actions.test.ts`; the barrel is gone.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: vi.fn(),
  createServiceClient: vi.fn(),
}));
vi.mock("@/lib/auth", async () => (await import("@/test/mock-auth")).mockAuthModule());
vi.mock("@/lib/data/mutations", () => ({
  createActivityEvent: vi.fn(),
  createComment: vi.fn(),
  updateComment: vi.fn(),
  toggleCommentLike: vi.fn(),
}));
vi.mock("@/lib/data/comment-queries", () => ({
  getCommentsByRoute: vi.fn(),
  getLikedCommentIds: vi.fn(),
}));
vi.mock("@/lib/data/route-queries", () => ({
  getRouteGrade: vi.fn(),
}));

const ROUTE_ID = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
const COMMENT_ID = "cccccccc-cccc-4ccc-cccc-cccccccccccc";

const mockAuth = { supabase: {} as never, userId: "user1", gymId: "gym1" };

beforeEach(() => {
  vi.resetAllMocks();
});

describe("editComment", () => {
  it("rejects empty body after trim", async () => {
    const { editComment } = await import("./comment-actions");
    const result = await editComment(COMMENT_ID, "   ");
    expect(result).toHaveProperty("error");
  });

  it("rejects body over 500 chars", async () => {
    const { editComment } = await import("./comment-actions");
    const result = await editComment(COMMENT_ID, "x".repeat(501));
    expect(result).toHaveProperty("error");
  });
});

describe("postComment", () => {
  it("rejects body over 500 chars", async () => {
    const { postComment } = await import("./comment-actions");
    const result = await postComment(ROUTE_ID, "x".repeat(501));
    expect(result).toHaveProperty("error", "Comments must be 500 characters or less");
  });

  it("creates activity event on success", async () => {
    const { requireAuth } = await import("@/lib/auth");
    vi.mocked(requireAuth).mockResolvedValue(mockAuth);

    const { createComment, createActivityEvent } = await import("@/lib/data/mutations");
    vi.mocked(createComment).mockResolvedValue({ id: COMMENT_ID } as never);
    vi.mocked(createActivityEvent).mockResolvedValue({} as never);

    const { postComment } = await import("./comment-actions");
    await postComment(ROUTE_ID, "good beta");

    expect(createActivityEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: "beta_spray" })
    );
  });
});
