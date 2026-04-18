import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));
vi.mock("next/server", () => ({
  after: (fn: () => unknown) => fn(),
}));
vi.mock("@/lib/auth", () => ({ requireSignedIn: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ data: [], error: null }),
      }),
    }),
  }),
}));
vi.mock("@/lib/achievements/context", () => ({
  buildBadgeContext: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/achievements/evaluate", () => ({
  evaluateAndPersistAchievements: vi.fn(),
}));
vi.mock("@/lib/data/jam-mutations", () => ({
  createJam: vi.fn(),
  joinJam: vi.fn(),
  leaveJam: vi.fn(),
  addJamRoute: vi.fn(),
  updateJamRoute: vi.fn(),
  upsertJamLog: vi.fn(),
  endJam: vi.fn(),
}));

const USER_A = "11111111-1111-1111-1111-111111111111";
const JAM_1 = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const ROUTE_1 = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

beforeEach(() => {
  vi.resetAllMocks();
});

async function mockSignedIn() {
  const { requireSignedIn } = await import("@/lib/auth");
  vi.mocked(requireSignedIn).mockResolvedValue({
    supabase: {} as never,
    userId: USER_A,
  });
}

describe("createJamAction", () => {
  it("rejects an invalid grading scale", async () => {
    const { createJamAction } = await import("./actions");
    const result = await createJamAction({
      name: null,
      location: null,
      gradingScale: "nope" as never,
    });
    expect(result).toEqual({ error: "Invalid grading scale" });
  });

  it("requires a min + max grade for V-scale", async () => {
    const { createJamAction } = await import("./actions");
    const result = await createJamAction({
      gradingScale: "v",
    });
    expect(result).toEqual({ error: expect.stringContaining("min and max") });
  });

  it("rejects a min grade out of range", async () => {
    const { createJamAction } = await import("./actions");
    const result = await createJamAction({
      gradingScale: "v",
      minGrade: -1,
      maxGrade: 5,
    });
    expect(result).toEqual({ error: expect.stringContaining("Min grade") });
  });

  it("rejects a max grade below the min", async () => {
    const { createJamAction } = await import("./actions");
    const result = await createJamAction({
      gradingScale: "v",
      minGrade: 5,
      maxGrade: 3,
    });
    expect(result).toEqual({ error: expect.stringContaining("Max grade") });
  });

  it("rejects a custom scale with no grades", async () => {
    const { createJamAction } = await import("./actions");
    const result = await createJamAction({
      gradingScale: "custom",
      customGrades: [],
    });
    expect(result).toEqual({ error: expect.stringContaining("at least one") });
  });

  it("rejects a custom scale with more than 50 grades", async () => {
    const { createJamAction } = await import("./actions");
    const tooMany = Array.from({ length: 51 }, (_, i) => `g${i}`);
    const result = await createJamAction({
      gradingScale: "custom",
      customGrades: tooMany,
    });
    expect(result).toEqual({ error: expect.stringContaining("Max 50") });
  });

  it("accepts a points-scale jam without grades", async () => {
    // Regression: points jams used to fall into the custom-grades
    // branch and always return "Add at least one custom grade".
    await mockSignedIn();
    const { createJam } = await import("@/lib/data/jam-mutations");
    vi.mocked(createJam).mockResolvedValue({ id: JAM_1, code: "ABCDEF" });

    const { createJamAction } = await import("./actions");
    const result = await createJamAction({
      gradingScale: "points",
    });
    expect(result).toEqual({ id: JAM_1, code: "ABCDEF" });
    expect(vi.mocked(createJam)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        gradingScale: "points",
        customGrades: null,
        minGrade: null,
        maxGrade: null,
      }),
    );
  });

  it("accepts a V-scale jam with valid bounds", async () => {
    await mockSignedIn();
    const { createJam } = await import("@/lib/data/jam-mutations");
    vi.mocked(createJam).mockResolvedValue({ id: JAM_1, code: "ABCDEF" });

    const { createJamAction } = await import("./actions");
    const result = await createJamAction({
      gradingScale: "v",
      minGrade: 0,
      maxGrade: 5,
    });
    expect(result).toEqual({ id: JAM_1, code: "ABCDEF" });
  });
});

describe("joinJamAction", () => {
  it("rejects a malformed jam id", async () => {
    const { joinJamAction } = await import("./actions");
    const result = await joinJamAction("not-a-uuid");
    expect(result).toEqual({ error: "Invalid jam id" });
  });
});

describe("leaveJamAction", () => {
  it("rejects a malformed jam id", async () => {
    const { leaveJamAction } = await import("./actions");
    const result = await leaveJamAction("not-a-uuid");
    expect(result).toEqual({ error: "Invalid jam id" });
  });
});

describe("addJamRouteAction", () => {
  it("rejects a malformed jam id", async () => {
    const { addJamRouteAction } = await import("./actions");
    const result = await addJamRouteAction({ jamId: "not-a-uuid" });
    expect(result).toEqual({ error: "Invalid jam id" });
  });
});

describe("updateJamRouteAction", () => {
  it("rejects a malformed route id", async () => {
    const { updateJamRouteAction } = await import("./actions");
    const result = await updateJamRouteAction({ routeId: "not-a-uuid" });
    expect(result).toEqual({ error: "Invalid route id" });
  });
});

describe("upsertJamLogAction", () => {
  it("rejects a malformed route id", async () => {
    const { upsertJamLogAction } = await import("./actions");
    const result = await upsertJamLogAction({
      jamRouteId: "not-a-uuid",
      attempts: 1,
      completed: true,
      zone: false,
    });
    expect(result).toEqual({ error: "Invalid route id" });
  });

  it("rejects a negative attempt count", async () => {
    const { upsertJamLogAction } = await import("./actions");
    const result = await upsertJamLogAction({
      jamRouteId: ROUTE_1,
      attempts: -1,
      completed: false,
      zone: false,
    });
    expect(result).toEqual({ error: "Invalid attempt count" });
  });

  it("rejects an absurd attempt count", async () => {
    const { upsertJamLogAction } = await import("./actions");
    const result = await upsertJamLogAction({
      jamRouteId: ROUTE_1,
      attempts: 1000,
      completed: false,
      zone: false,
    });
    expect(result).toEqual({ error: "Invalid attempt count" });
  });
});

describe("endJamAction", () => {
  it("rejects a malformed jam id", async () => {
    const { endJamAction } = await import("./actions");
    const result = await endJamAction("not-a-uuid");
    expect(result).toEqual({ error: "Invalid jam id" });
  });
});
