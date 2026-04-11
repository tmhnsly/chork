import { describe, it, expect } from "vitest";
import { createOptimisticLog } from "./types";

describe("createOptimisticLog", () => {
  const base = {
    id: "log1",
    user_id: "user1",
    route_id: "route1",
    gym_id: "gym1",
    attempts: 3,
    completed: false,
    zone: false,
  };

  it("sets completed_at to ISO string when completed", () => {
    const log = createOptimisticLog({ ...base, completed: true });
    expect(log.completed_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("sets completed_at to null when not completed", () => {
    const log = createOptimisticLog({ ...base, completed: false });
    expect(log.completed_at).toBeNull();
  });

  it("defaults grade_vote to null when omitted", () => {
    const log = createOptimisticLog(base);
    expect(log.grade_vote).toBeNull();
  });
});
