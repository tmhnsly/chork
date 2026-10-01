import { describe, it, expect } from "vitest";
import { flipOffset, localPlace, parseTranslate } from "./flip";

describe("parseTranslate", () => {
  it("reads every shape computed style gives", () => {
    expect(parseTranslate("none")).toEqual({ x: 0, y: 0 });
    expect(parseTranslate("")).toEqual({ x: 0, y: 0 });
    expect(parseTranslate(null)).toEqual({ x: 0, y: 0 });
    expect(parseTranslate("12.5px")).toEqual({ x: 12.5, y: 0 });
    expect(parseTranslate("12px -4px")).toEqual({ x: 12, y: -4 });
    expect(parseTranslate("12px -4px 0px")).toEqual({ x: 12, y: -4 });
  });
});

describe("localPlace", () => {
  const origin = { left: 100, top: 50, bottom: 450 };

  it("is container-relative, so a moving container doesn't leak into it", () => {
    const a = localPlace({ left: 160, top: 90, bottom: 190 }, origin, 1, { x: 0, y: 0 }, "top");
    const b = localPlace({ left: 160 + 7, top: 90 + 300, bottom: 190 + 300 },
      { left: 107, top: 350, bottom: 750 }, 1, { x: 0, y: 0 }, "top");
    expect(a).toEqual(b);
  });

  it("undoes a container's zoom: 120 screen px under zoom 1.2 is 100 local px", () => {
    const { layout } = localPlace({ left: 100 + 120, top: 50, bottom: 450 }, origin, 1.2, { x: 0, y: 0 }, "top");
    expect(layout.x).toBeCloseTo(100);
  });

  it("separates where it is drawn from where its box is", () => {
    const { drawn, layout } = localPlace({ left: 130, top: 50, bottom: 450 }, origin, 1, { x: 30, y: 0 }, "top");
    expect(drawn).toEqual({ x: 30, y: 0 });
    expect(layout).toEqual({ x: 0, y: 0 });
  });

  it("reads y from the bottom when anchored there — a taller column on the same floor hasn't moved", () => {
    const short = localPlace({ left: 100, top: 350, bottom: 450 }, origin, 1, { x: 0, y: 0 }, "bottom");
    const tall = localPlace({ left: 100, top: 250, bottom: 450 }, origin, 1, { x: 0, y: 0 }, "bottom");
    expect(short.layout.y).toBe(tall.layout.y);
  });
});

describe("flipOffset", () => {
  it("is null for an element seen for the first time, or one that hasn't moved", () => {
    expect(flipOffset(undefined, { x: 10, y: 0 })).toBeNull();
    expect(flipOffset({ x: 10, y: 0 }, { x: 10.2, y: 0 })).toBeNull();
  });

  it("holds a moved element where it was drawn", () => {
    expect(flipOffset({ x: 190, y: 0 }, { x: 0, y: 0 })).toEqual({ x: 190, y: 0 });
  });

  it("a change mid-move starts from the drawn position, not the old destination", () => {
    // Travelling from x=190 to x=0, drawn at x=64 when the next change
    // sends it to x=87: it must start at 64, i.e. 64 - 87 = -23 off.
    expect(flipOffset({ x: 64, y: 0 }, { x: 87, y: 0 })).toEqual({ x: -23, y: 0 });
  });
});
