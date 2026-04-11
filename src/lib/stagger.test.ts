import { describe, it, expect } from "vitest";
import { scatteredOrder } from "./stagger";

describe("scatteredOrder", () => {
  it("returns an array of the correct length", () => {
    expect(scatteredOrder(5)).toHaveLength(5);
    expect(scatteredOrder(15)).toHaveLength(15);
  });

  it("contains every index exactly once (is a permutation)", () => {
    const order = scatteredOrder(10);
    const sorted = [...order].sort((a, b) => a - b);
    expect(sorted).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("is deterministic (same input = same output)", () => {
    const a = scatteredOrder(12);
    const b = scatteredOrder(12);
    expect(a).toEqual(b);
  });

  it("different seeds produce different orders", () => {
    const a = scatteredOrder(12, 0);
    const b = scatteredOrder(12, 42);
    expect(a).not.toEqual(b);
  });

  it("is not sequential (actually scattered)", () => {
    const order = scatteredOrder(10);
    const sequential = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    expect(order).not.toEqual(sequential);
  });

  it("handles count of 1", () => {
    expect(scatteredOrder(1)).toEqual([0]);
  });

  it("handles count of 0", () => {
    expect(scatteredOrder(0)).toEqual([]);
  });
});
