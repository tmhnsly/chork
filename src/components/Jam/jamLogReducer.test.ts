import { describe, expect, it } from "vitest";
import {
  initJamLogDraft,
  jamLogReducer,
  type JamLogDraft,
} from "./jamLogReducer";

/**
 * The {attempts, completed, zone} triple is one value — these tests
 * pin the transitions that used to be enforced by hand across four
 * handlers and two mirror refs in JamLogSheet, with zero coverage.
 */

const empty: JamLogDraft = { attempts: 0, completed: false, zone: false };

describe("initJamLogDraft", () => {
  it("starts empty with no existing log", () => {
    expect(initJamLogDraft(null)).toEqual(empty);
  });

  it("pre-fills from the existing log", () => {
    expect(
      initJamLogDraft({ attempts: 3, completed: true, zone: true }),
    ).toEqual({ attempts: 3, completed: true, zone: true });
  });
});

describe("set-attempts", () => {
  it("updates the count while uncompleted", () => {
    const next = jamLogReducer(empty, { type: "set-attempts", attempts: 2 });
    expect(next).toEqual({ ...empty, attempts: 2 });
  });

  it("is a strict no-op (same reference) while completed — attempts are frozen", () => {
    const completed: JamLogDraft = { attempts: 2, completed: true, zone: false };
    const next = jamLogReducer(completed, { type: "set-attempts", attempts: 9 });
    expect(next).toBe(completed);
  });
});

describe("mark-complete", () => {
  it("coerces zero attempts to 1 — the send IS the first attempt (and a flash)", () => {
    const next = jamLogReducer(empty, { type: "mark-complete" });
    expect(next).toEqual({ attempts: 1, completed: true, zone: false });
  });

  it("keeps a real attempt count as-is", () => {
    const next = jamLogReducer(
      { attempts: 4, completed: false, zone: true },
      { type: "mark-complete" },
    );
    expect(next).toEqual({ attempts: 4, completed: true, zone: true });
  });
});

describe("undo-complete", () => {
  it("clears completed but keeps attempts — the tries happened either way", () => {
    const next = jamLogReducer(
      { attempts: 3, completed: true, zone: true },
      { type: "undo-complete" },
    );
    expect(next).toEqual({ attempts: 3, completed: false, zone: true });
  });
});

describe("set-zone", () => {
  it("toggles zone independently of the other fields", () => {
    const on = jamLogReducer(empty, { type: "set-zone", zone: true });
    expect(on).toEqual({ ...empty, zone: true });
    const off = jamLogReducer(on, { type: "set-zone", zone: false });
    expect(off).toEqual(empty);
  });

  it("works while completed (zone editable after the send)", () => {
    const next = jamLogReducer(
      { attempts: 1, completed: true, zone: false },
      { type: "set-zone", zone: true },
    );
    expect(next).toEqual({ attempts: 1, completed: true, zone: true });
  });
});

describe("idempotent pairs", () => {
  it("mark-complete → undo-complete round-trips (modulo the 0→1 coerce)", () => {
    const start: JamLogDraft = { attempts: 2, completed: false, zone: false };
    const roundTripped = jamLogReducer(
      jamLogReducer(start, { type: "mark-complete" }),
      { type: "undo-complete" },
    );
    expect(roundTripped).toEqual(start);
  });
});
