import { describe, expect, it } from "vitest";
import { initialSheetPresence, nextSheetPresence } from "./use-sheet-presence";

/**
 * The held-sheet contract: a closing sheet keeps its content, and every
 * open mounts a fresh sheet.
 *
 * The second half is what broke. The Card's route sheet seeds a reducer
 * and a log-id ref from the route's log when it mounts; once the held
 * sheet stopped unmounting, every tile after the first rendered, and
 * wrote to, the first route's log. The open key is what a sheet wears
 * as its `key` so a new open cannot inherit an old mount.
 */
describe("nextSheetPresence", () => {
  const a = { id: "a" };
  const b = { id: "b" };

  it("starts closed, with nothing held", () => {
    const s = initialSheetPresence<typeof a>();
    expect(s.held).toBeNull();
    expect(s.openKey).toBe(0);
  });

  it("holds the selection through the close, keeping the same open key", () => {
    const opened = nextSheetPresence(initialSheetPresence<typeof a>(), a);
    const closing = nextSheetPresence(opened, null);
    expect(closing.held).toBe(a);
    expect(closing.openKey).toBe(opened.openKey);
  });

  it("gives a different selection a new open key", () => {
    let s = nextSheetPresence(initialSheetPresence<typeof a>(), a);
    s = nextSheetPresence(s, null);
    const firstKey = s.openKey;
    s = nextSheetPresence(s, b);
    expect(s.held).toBe(b);
    expect(s.openKey).not.toBe(firstKey);
  });

  it("gives the SAME selection a new open key when it is opened again", () => {
    // Keying by id alone would reuse the old mount here, and a log that
    // changed while the sheet was closed would render stale.
    let s = nextSheetPresence(initialSheetPresence<typeof a>(), a);
    const firstKey = s.openKey;
    s = nextSheetPresence(s, null);
    s = nextSheetPresence(s, a);
    expect(s.openKey).not.toBe(firstKey);
  });

  it("keeps the open key while the value changes inside one open", () => {
    // Navigating within an open sheet (achievements grid → badge) must
    // not remount it, or the view cross-fade and scroll position reset.
    let s = nextSheetPresence(initialSheetPresence<typeof a>(), a);
    const key = s.openKey;
    s = nextSheetPresence(s, b);
    expect(s.held).toBe(b);
    expect(s.openKey).toBe(key);
  });

  it("returns the same state when nothing changed, so the hook never loops", () => {
    const s = nextSheetPresence(initialSheetPresence<typeof a>(), a);
    expect(nextSheetPresence(s, a)).toBe(s);
    const closed = nextSheetPresence(s, null);
    expect(nextSheetPresence(closed, undefined)).toBe(closed);
  });
});
