import { describe, it, expect } from "vitest";
import { pinProgress, stepAt } from "./scroll-progress";

describe("pinProgress", () => {
  // A pinned section is `height` tall in a `viewport` tall window. Its
  // sticky child is pinned from the moment the section's top reaches
  // the viewport top (progress 0) until its bottom reaches the
  // viewport bottom (progress 1).
  it("is 0 while the section top is at or below the viewport top", () => {
    expect(pinProgress(0, 3000, 1000)).toBe(0);
    expect(pinProgress(400, 3000, 1000)).toBe(0);
  });
  it("is 1 once the section bottom has reached the viewport bottom", () => {
    expect(pinProgress(-2000, 3000, 1000)).toBe(1);
    expect(pinProgress(-2600, 3000, 1000)).toBe(1);
  });
  it("is linear across the travel between", () => {
    expect(pinProgress(-1000, 3000, 1000)).toBeCloseTo(0.5);
    expect(pinProgress(-500, 3000, 1000)).toBeCloseTo(0.25);
  });
  it("a section no taller than the viewport is 0 until it is scrolled past, then 1", () => {
    expect(pinProgress(10, 800, 1000)).toBe(0);
    expect(pinProgress(-1, 800, 1000)).toBe(1);
  });
});

describe("stepAt", () => {
  it("spreads the steps evenly over the travel, the last one held to the end", () => {
    expect(stepAt(0, 4)).toBe(0);
    expect(stepAt(0.24, 4)).toBe(0);
    expect(stepAt(0.25, 4)).toBe(1);
    expect(stepAt(0.5, 4)).toBe(2);
    expect(stepAt(0.99, 4)).toBe(3);
    expect(stepAt(1, 4)).toBe(3);
  });
  it("one step is always step 0", () => {
    expect(stepAt(0, 1)).toBe(0);
    expect(stepAt(1, 1)).toBe(0);
  });
  it("clamps a stray progress outside 0..1", () => {
    expect(stepAt(-0.2, 3)).toBe(0);
    expect(stepAt(1.4, 3)).toBe(2);
  });
});
