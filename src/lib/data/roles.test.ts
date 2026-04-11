import { describe, it, expect } from "vitest";
import { isGymAdmin, ADMIN_ROLES } from "./roles";

describe("isGymAdmin", () => {
  it("returns true for admin roles", () => {
    expect(isGymAdmin("admin")).toBe(true);
    expect(isGymAdmin("owner")).toBe(true);
    expect(isGymAdmin("setter")).toBe(true);
  });

  it("returns false for climber", () => {
    expect(isGymAdmin("climber")).toBe(false);
  });

  it("returns false for null", () => {
    expect(isGymAdmin(null)).toBe(false);
  });

  it("ADMIN_ROLES contains exactly the expected roles", () => {
    expect(ADMIN_ROLES).toEqual(["admin", "owner", "setter"]);
  });
});
