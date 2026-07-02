import { describe, expect, it } from "vitest";
import { one } from "./read";

describe("one", () => {
  it("passes a plain object through", () => {
    expect(one({ set_id: "s1" })).toEqual({ set_id: "s1" });
  });

  it("takes the first element of a single-element array", () => {
    expect(one([{ set_id: "s1" }])).toEqual({ set_id: "s1" });
  });

  it("takes the first element when the array has several", () => {
    expect(one([{ id: 1 }, { id: 2 }])).toEqual({ id: 1 });
  });

  it("collapses an empty array to null", () => {
    expect(one([])).toBeNull();
  });

  it("collapses null to null", () => {
    expect(one(null)).toBeNull();
  });

  it("collapses undefined to null (optional embed column)", () => {
    expect(one(undefined)).toBeNull();
  });
});
