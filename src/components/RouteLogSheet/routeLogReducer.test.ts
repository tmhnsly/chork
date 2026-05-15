import { describe, it, expect } from "vitest";
import type { Comment, RouteLog } from "@/lib/data";
import type { CachedRouteData } from "./types";
import {
  initialRouteLogState,
  routeLogReducer,
  type RouteLogState,
} from "./routeLogReducer";

// ── Fixtures ─────────────────────────────────────────

function makeLog(overrides: Partial<RouteLog> = {}): RouteLog {
  return {
    id: "log-1",
    user_id: "user-1",
    route_id: "route-1",
    gym_id: "gym-1",
    attempts: 2,
    completed: false,
    zone: false,
    grade_vote: null,
    completed_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeComment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: "c-1",
    route_id: "route-1",
    user_id: "user-2",
    gym_id: "gym-1",
    body: "heel hook",
    likes: 0,
    parent_id: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    profiles: null,
    ...overrides,
  };
}

function freshState(overrides: Partial<RouteLogState> = {}): RouteLogState {
  return { ...initialRouteLogState(null), ...overrides };
}

// ── Tests ────────────────────────────────────────────

describe("initialRouteLogState", () => {
  it("seeds attempts from the log (or 0 when log is null)", () => {
    expect(initialRouteLogState(null).attempts).toBe(0);
    expect(initialRouteLogState(makeLog({ attempts: 4 })).attempts).toBe(4);
  });

  it("seeds gradeVote from the log's grade_vote (null when absent)", () => {
    expect(initialRouteLogState(null).gradeVote).toBeNull();
    expect(
      initialRouteLogState(makeLog({ grade_vote: 6 })).gradeVote,
    ).toBe(6);
  });

  it("starts with gradeLabel null (loading), commentsLoaded false, empty likedIds", () => {
    const s = initialRouteLogState(null);
    expect(s.gradeLabel).toBeNull();
    expect(s.commentsLoaded).toBe(false);
    expect(s.likedIds.size).toBe(0);
  });
});

describe("set-attempts", () => {
  it("updates only attempts", () => {
    const state = freshState({ attempts: 0, currentLog: makeLog() });
    const next = routeLogReducer(state, { type: "set-attempts", attempts: 5 });
    expect(next.attempts).toBe(5);
    expect(next.currentLog).toBe(state.currentLog);
  });
});

describe("patch-log", () => {
  it("preserves untouched fields", () => {
    const state = freshState({ currentLog: makeLog({ attempts: 3, zone: false }) });
    const next = routeLogReducer(state, {
      type: "patch-log",
      patch: { zone: true },
    });
    expect(next.currentLog?.zone).toBe(true);
    expect(next.currentLog?.attempts).toBe(3);
    expect(next.currentLog?.user_id).toBe("user-1");
  });

  it("is a no-op when currentLog is null (does not fabricate a log)", () => {
    const state = freshState({ currentLog: null });
    const next = routeLogReducer(state, {
      type: "patch-log",
      patch: { zone: true },
    });
    expect(next).toBe(state);
  });

  it("updates attempts in lockstep with the patch when provided", () => {
    const state = freshState({
      attempts: 0,
      currentLog: makeLog({ attempts: 0 }),
    });
    const next = routeLogReducer(state, {
      type: "patch-log",
      patch: { attempts: 3 },
      attempts: 3,
    });
    expect(next.attempts).toBe(3);
    expect(next.currentLog?.attempts).toBe(3);
  });
});

describe("completion lifecycle", () => {
  it("begin-complete / end-complete flip only completing", () => {
    const state = freshState({ attempts: 4, currentLog: makeLog() });
    const a = routeLogReducer(state, { type: "begin-complete" });
    expect(a.completing).toBe(true);
    expect(a.attempts).toBe(4);
    expect(a.currentLog).toBe(state.currentLog);

    const b = routeLogReducer(a, { type: "end-complete" });
    expect(b.completing).toBe(false);
    expect(b.attempts).toBe(4);
  });
});

describe("revert-log (regression: snapshot revert path)", () => {
  // Bug-fix regression: handleMarkComplete was reverting to the
  // mount-time `log` prop, not the currentLog at click time. The
  // reducer now provides a single atomic revert that restores the
  // trio (log + attempts + gradeVote) — invariant pinned here.
  it("restores log + attempts + gradeVote from a snapshot triple", () => {
    const optimistic = makeLog({ attempts: 1, completed: true, grade_vote: 8 });
    const snapshot = makeLog({ attempts: 3, completed: false, grade_vote: null });
    const state = freshState({
      attempts: 1,
      currentLog: optimistic,
      gradeVote: 8,
    });
    const next = routeLogReducer(state, {
      type: "revert-log",
      log: snapshot,
      attempts: 3,
      gradeVote: null,
    });
    expect(next.currentLog).toBe(snapshot);
    expect(next.attempts).toBe(3);
    expect(next.gradeVote).toBeNull();
  });
});

describe("set-grade-vote does not clear gradeLabel", () => {
  // The user's vote is independent of the community-grade display.
  // Toggling vote off shouldn't blank the label — the average just
  // recomputes (or drops this climber's contribution).
  it("leaves gradeLabel intact when vote changes", () => {
    const state = freshState({ gradeLabel: "V5", gradeVote: 5 });
    const next = routeLogReducer(state, {
      type: "set-grade-vote",
      vote: null,
    });
    expect(next.gradeVote).toBeNull();
    expect(next.gradeLabel).toBe("V5");
  });
});

describe("toggle-like (atomic likedIds + comments[i].likes)", () => {
  it("liking flips likedIds AND increments the cached count in one transition", () => {
    const comment = makeComment({ id: "c-1", likes: 4 });
    const state = freshState({ comments: [comment], likedIds: new Set() });
    const next = routeLogReducer(state, {
      type: "toggle-like",
      commentId: "c-1",
      liked: true,
    });
    expect(next.likedIds.has("c-1")).toBe(true);
    expect(next.comments[0].likes).toBe(5);
  });

  it("unliking removes from likedIds AND decrements the count", () => {
    const comment = makeComment({ id: "c-1", likes: 4 });
    const state = freshState({
      comments: [comment],
      likedIds: new Set(["c-1"]),
    });
    const next = routeLogReducer(state, {
      type: "toggle-like",
      commentId: "c-1",
      liked: false,
    });
    expect(next.likedIds.has("c-1")).toBe(false);
    expect(next.comments[0].likes).toBe(3);
  });

  it("a toggle pair (like → unlike) restores the original state", () => {
    const comment = makeComment({ id: "c-1", likes: 4 });
    const state = freshState({ comments: [comment], likedIds: new Set() });
    const liked = routeLogReducer(state, {
      type: "toggle-like",
      commentId: "c-1",
      liked: true,
    });
    const unliked = routeLogReducer(liked, {
      type: "toggle-like",
      commentId: "c-1",
      liked: false,
    });
    expect(unliked.likedIds.has("c-1")).toBe(false);
    expect(unliked.comments[0].likes).toBe(4);
  });

  it("does not mutate other comments in the list", () => {
    const a = makeComment({ id: "c-1", likes: 2 });
    const b = makeComment({ id: "c-2", likes: 7 });
    const state = freshState({ comments: [a, b], likedIds: new Set() });
    const next = routeLogReducer(state, {
      type: "toggle-like",
      commentId: "c-1",
      liked: true,
    });
    expect(next.comments[0].likes).toBe(3);
    expect(next.comments[1].likes).toBe(7);
  });
});

describe("append-comments", () => {
  it("extends comments, advances nextPage, updates hasMore", () => {
    const seed = makeComment({ id: "c-1" });
    const state = freshState({
      comments: [seed],
      totalComments: 5,
      nextPage: 2,
      hasMore: true,
    });
    const next = routeLogReducer(state, {
      type: "append-comments",
      result: {
        items: [makeComment({ id: "c-2" }), makeComment({ id: "c-3" })],
        totalItems: 5,
        totalPages: 2,
        page: 2,
      },
    });
    expect(next.comments.map((c) => c.id)).toEqual(["c-1", "c-2", "c-3"]);
    expect(next.nextPage).toBe(3);
    expect(next.hasMore).toBe(false); // page (2) is not < totalPages (2)
  });

  it("flips hasMore back on when more pages remain", () => {
    const state = freshState({ nextPage: 1, hasMore: false });
    const next = routeLogReducer(state, {
      type: "append-comments",
      result: {
        items: [makeComment()],
        totalItems: 30,
        totalPages: 3,
        page: 1,
      },
    });
    expect(next.hasMore).toBe(true);
  });
});

describe("prepend-comment", () => {
  it("adds the new comment at the front AND increments totalComments", () => {
    const seed = makeComment({ id: "c-old" });
    const state = freshState({ comments: [seed], totalComments: 1 });
    const next = routeLogReducer(state, {
      type: "prepend-comment",
      comment: makeComment({ id: "c-new" }),
    });
    expect(next.comments.map((c) => c.id)).toEqual(["c-new", "c-old"]);
    expect(next.totalComments).toBe(2);
  });
});

describe("replace-comment", () => {
  it("swaps the matching comment by id without touching siblings", () => {
    const a = makeComment({ id: "c-1", body: "old" });
    const b = makeComment({ id: "c-2", body: "untouched" });
    const state = freshState({ comments: [a, b] });
    const next = routeLogReducer(state, {
      type: "replace-comment",
      comment: makeComment({ id: "c-1", body: "edited" }),
    });
    expect(next.comments[0].body).toBe("edited");
    expect(next.comments[1].body).toBe("untouched");
  });
});

describe("hydrate-route-data", () => {
  it("populates grade label, likedIds, comments, count, pagination, commentsLoaded in one shot", () => {
    const state = freshState();
    const data: CachedRouteData = {
      grade: 5,
      comments: {
        items: [makeComment({ id: "c-1" })],
        totalItems: 1,
        totalPages: 1,
        page: 1,
      },
      likedIds: ["c-1"],
    };
    const next = routeLogReducer(state, {
      type: "hydrate-route-data",
      data,
      gradingScale: "v",
    });
    expect(next.gradeLabel).toBe("V5");
    expect(next.likedIds.has("c-1")).toBe(true);
    expect(next.comments).toHaveLength(1);
    expect(next.totalComments).toBe(1);
    expect(next.hasMore).toBe(false);
    expect(next.nextPage).toBe(2);
    expect(next.commentsLoaded).toBe(true);
  });

  it("renders gradeLabel as 'Ungraded' when grade is null", () => {
    const state = freshState();
    const data: CachedRouteData = {
      grade: null,
      comments: { items: [], totalItems: 0, totalPages: 0, page: 1 },
      likedIds: [],
    };
    const next = routeLogReducer(state, {
      type: "hydrate-route-data",
      data,
      gradingScale: "v",
    });
    expect(next.gradeLabel).toBe("Ungraded");
  });
});

describe("toggle-beta", () => {
  it("flips betaExpanded", () => {
    const state = freshState({ betaExpanded: false });
    const a = routeLogReducer(state, { type: "toggle-beta" });
    expect(a.betaExpanded).toBe(true);
    const b = routeLogReducer(a, { type: "toggle-beta" });
    expect(b.betaExpanded).toBe(false);
  });
});

describe("set-loading-comments / set-loading-more", () => {
  it("set independently and don't touch each other", () => {
    const state = freshState();
    const a = routeLogReducer(state, {
      type: "set-loading-comments",
      loading: true,
    });
    expect(a.loadingComments).toBe(true);
    expect(a.loadingMore).toBe(false);

    const b = routeLogReducer(a, {
      type: "set-loading-more",
      loading: true,
    });
    expect(b.loadingComments).toBe(true);
    expect(b.loadingMore).toBe(true);
  });
});
