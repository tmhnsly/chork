import { describe, it, expect } from "vitest";
import {
  achievementsOverlayReducer,
  initialOverlayState,
  type OverlayState,
} from "./achievementsOverlayReducer";
import type { BadgeStatus } from "@/lib/badges";

// The reducer never reads badge internals — any object with identity
// works. Cast keeps the fixture honest about what's exercised.
const badge = (id: string) =>
  ({ badge: { id }, earned: false, progress: null, current: null }) as unknown as BadgeStatus;

const closed = initialOverlayState;
const grid: OverlayState = { view: { name: "grid" }, gridScroll: 0 };

describe("achievementsOverlayReducer", () => {
  it("starts closed with no saved scroll", () => {
    expect(closed).toEqual({ view: { name: "closed" }, gridScroll: 0 });
  });

  // ── Opening ─────────────────────────────────────
  it("open-grid shows the catalogue", () => {
    expect(achievementsOverlayReducer(closed, { type: "open-grid" })).toEqual(grid);
  });

  it("open-grid is idempotent from the grid", () => {
    expect(achievementsOverlayReducer(grid, { type: "open-grid" })).toEqual(grid);
  });

  it("a shelf tap opens the detail directly, origin shelf", () => {
    const b = badge("century");
    const next = achievementsOverlayReducer(closed, {
      type: "open-detail",
      badge: b,
      from: "shelf",
    });
    expect(next.view).toEqual({ name: "detail", badge: b, from: "shelf" });
  });

  // ── Grid → detail → back ────────────────────────
  it("a grid tap opens the detail and remembers the grid scroll", () => {
    const b = badge("thunder");
    const next = achievementsOverlayReducer(grid, {
      type: "open-detail",
      badge: b,
      from: "grid",
      gridScroll: 480,
    });
    expect(next.view).toEqual({ name: "detail", badge: b, from: "grid" });
    expect(next.gridScroll).toBe(480);
  });

  it("back from a grid-origin detail returns to the grid, scroll intact", () => {
    const inDetail = achievementsOverlayReducer(grid, {
      type: "open-detail",
      badge: badge("thunder"),
      from: "grid",
      gridScroll: 480,
    });
    const back = achievementsOverlayReducer(inDetail, { type: "back" });
    expect(back.view).toEqual({ name: "grid" });
    // The component reads this to restore the catalogue's position.
    expect(back.gridScroll).toBe(480);
  });

  it("back from a shelf-origin detail closes — there is no grid to return to", () => {
    const inDetail = achievementsOverlayReducer(closed, {
      type: "open-detail",
      badge: badge("century"),
      from: "shelf",
    });
    const back = achievementsOverlayReducer(inDetail, { type: "back" });
    expect(back.view).toEqual({ name: "closed" });
  });

  it("back from the grid or closed is a no-op", () => {
    expect(achievementsOverlayReducer(grid, { type: "back" })).toEqual(grid);
    expect(achievementsOverlayReducer(closed, { type: "back" })).toEqual(closed);
  });

  // ── Closing ─────────────────────────────────────
  it("close collapses everything from any view and forgets the scroll", () => {
    const inDetail = achievementsOverlayReducer(grid, {
      type: "open-detail",
      badge: badge("thunder"),
      from: "grid",
      gridScroll: 480,
    });
    for (const state of [grid, inDetail]) {
      expect(achievementsOverlayReducer(state, { type: "close" })).toEqual(closed);
    }
  });

  // ── Defensive transitions ───────────────────────
  it("a detail tap while a detail is open swaps the badge in place", () => {
    const first = achievementsOverlayReducer(grid, {
      type: "open-detail",
      badge: badge("thunder"),
      from: "grid",
      gridScroll: 120,
    });
    const b2 = badge("saviour");
    const swapped = achievementsOverlayReducer(first, {
      type: "open-detail",
      badge: b2,
      from: "grid",
    });
    expect(swapped.view).toEqual({ name: "detail", badge: b2, from: "grid" });
    // No fresh scroll provided — the remembered one survives the swap.
    expect(swapped.gridScroll).toBe(120);
  });

  it("open-grid from a detail returns to the grid (See-all is always safe)", () => {
    const inDetail = achievementsOverlayReducer(closed, {
      type: "open-detail",
      badge: badge("century"),
      from: "shelf",
    });
    expect(achievementsOverlayReducer(inDetail, { type: "open-grid" }).view).toEqual({
      name: "grid",
    });
  });
});
