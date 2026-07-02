import { describe, expect, it } from "vitest";
import {
  createResourceCache,
  isSettledFor,
  makeErrorEntry,
  resolveResource,
  shouldFetch,
  type ResourceEntry,
} from "./client-resource";

const success = (key: string, token = 0): ResourceEntry<string> => ({
  key,
  token,
  status: "success",
  data: `data-for-${key}`,
});

const failure = (key: string, token = 0, data?: string): ResourceEntry<string> =>
  data === undefined
    ? { key, token, status: "error", error: new Error("boom") }
    : { key, token, status: "error", error: new Error("boom"), data };

describe("isSettledFor", () => {
  it("is false for an empty cache", () => {
    expect(isSettledFor(null, "a", 0)).toBe(false);
  });

  it("is false when the key does not match (stale entry)", () => {
    expect(isSettledFor(success("a"), "b", 0)).toBe(false);
  });

  it("is false when the reload token moved on", () => {
    expect(isSettledFor(success("a", 0), "a", 1)).toBe(false);
  });

  it("is true for an exact key + token match, success or error", () => {
    expect(isSettledFor(success("a", 2), "a", 2)).toBe(true);
    expect(isSettledFor(failure("a", 2), "a", 2)).toBe(true);
  });
});

describe("shouldFetch", () => {
  it("never fetches while disabled", () => {
    expect(
      shouldFetch({ entry: null, key: "a", token: 0, enabled: false, reEnabled: false }),
    ).toBe(false);
  });

  it("fetches when nothing is settled for the key", () => {
    expect(
      shouldFetch({ entry: null, key: "a", token: 0, enabled: true, reEnabled: false }),
    ).toBe(true);
    expect(
      shouldFetch({
        entry: success("old"),
        key: "new",
        token: 0,
        enabled: true,
        reEnabled: false,
      }),
    ).toBe(true);
  });

  it("skips a settled success — component caches never refetch what they have", () => {
    expect(
      shouldFetch({
        entry: success("a"),
        key: "a",
        token: 0,
        enabled: true,
        reEnabled: false,
      }),
    ).toBe(false);
    // Even a re-open doesn't refetch good data (GymSwitcher's
    // fetch-once-per-mount semantics).
    expect(
      shouldFetch({
        entry: success("a"),
        key: "a",
        token: 0,
        enabled: true,
        reEnabled: true,
      }),
    ).toBe(false);
  });

  it("retries a settled error only on re-enable — no retry loop while open", () => {
    // Sheet still open, error settled → no retry loop.
    expect(
      shouldFetch({
        entry: failure("a"),
        key: "a",
        token: 0,
        enabled: true,
        reEnabled: false,
      }),
    ).toBe(false);
    // Sheet closed and re-opened → retry (the hand-rolled `loaded`
    // flag behaviour in the old NotificationsSheet).
    expect(
      shouldFetch({
        entry: failure("a"),
        key: "a",
        token: 0,
        enabled: true,
        reEnabled: true,
      }),
    ).toBe(true);
  });

  it("refetches when the reload token bumps past a settled entry", () => {
    expect(
      shouldFetch({
        entry: success("a", 0),
        key: "a",
        token: 1,
        enabled: true,
        reEnabled: false,
      }),
    ).toBe(true);
  });
});

describe("resolveResource", () => {
  it("derives loading from the key mismatch — the keyed-cache identity trick", () => {
    const view = resolveResource({
      entry: success("old"),
      key: "new",
      token: 0,
      enabled: true,
    });
    expect(view.loading).toBe(true);
    expect(view.data).toBeNull();
    expect(view.error).toBeNull();
  });

  it("exposes data for a settled success", () => {
    const view = resolveResource({ entry: success("a"), key: "a", token: 0, enabled: true });
    expect(view.data).toBe("data-for-a");
    expect(view.loading).toBe(false);
    expect(view.error).toBeNull();
  });

  it("is idle (not loading) while disabled", () => {
    const view = resolveResource({ entry: null, key: "a", token: 0, enabled: false });
    expect(view).toEqual({ data: null, loading: false, error: null });
  });

  it("settled error: error exposed, loading false, data null", () => {
    const view = resolveResource({ entry: failure("a"), key: "a", token: 0, enabled: true });
    expect(view.error).toBeInstanceOf(Error);
    expect(view.loading).toBe(false);
    expect(view.data).toBeNull();
  });

  it("keepPreviousData serves the stale entry's data while the new key loads", () => {
    const view = resolveResource({
      entry: success("old"),
      key: "new",
      token: 0,
      enabled: true,
      keepPreviousData: true,
    });
    expect(view.data).toBe("data-for-old");
    expect(view.loading).toBe(true);
  });

  it("keepPreviousData serves data carried on an error entry (stale-while-error)", () => {
    const view = resolveResource({
      entry: failure("a", 0, "last-good"),
      key: "a",
      token: 0,
      enabled: true,
      keepPreviousData: true,
    });
    expect(view.data).toBe("last-good");
    expect(view.error).toBeInstanceOf(Error);
  });

  it("without keepPreviousData a stale entry yields null data", () => {
    const view = resolveResource({
      entry: success("old"),
      key: "new",
      token: 0,
      enabled: true,
      keepPreviousData: false,
    });
    expect(view.data).toBeNull();
  });
});

describe("makeErrorEntry", () => {
  it("carries no data when there was no previous entry", () => {
    const entry = makeErrorEntry<string>(null, "a", 0, "err");
    expect(entry).toEqual({ key: "a", token: 0, status: "error", error: "err" });
    expect("data" in entry).toBe(false);
  });

  it("carries the previous success data forward", () => {
    const entry = makeErrorEntry(success("a"), "a", 0, "err");
    expect(entry.data).toBe("data-for-a");
  });

  it("keeps carrying data through consecutive errors", () => {
    const first = makeErrorEntry(success("a"), "a", 0, "err1");
    const second = makeErrorEntry(first, "a", 0, "err2");
    expect(second.data).toBe("data-for-a");
  });
});

describe("createResourceCache", () => {
  it("returns fresh values and misses on unknown keys", () => {
    const cache = createResourceCache<number>({ ttlMs: 1000, now: () => 0 });
    cache.set("a", 42);
    expect(cache.get("a")).toBe(42);
    expect(cache.get("b")).toBeUndefined();
  });

  it("expires entries strictly past the TTL and evicts them", () => {
    let now = 0;
    const cache = createResourceCache<number>({ ttlMs: 30_000, now: () => now });
    cache.set("a", 1);
    now = 30_000; // exactly at TTL — still fresh (matches old readCache: `> TTL` expires)
    expect(cache.get("a")).toBe(1);
    now = 30_001;
    expect(cache.get("a")).toBeUndefined();
    // Evicted — a later clock rollback (never happens, but proves
    // deletion) still misses.
    now = 0;
    expect(cache.get("a")).toBeUndefined();
  });

  it("set refreshes the entry's clock", () => {
    let now = 0;
    const cache = createResourceCache<number>({ ttlMs: 100, now: () => now });
    cache.set("a", 1);
    now = 90;
    cache.set("a", 2);
    now = 150; // 60ms after the rewrite, 150ms after the original
    expect(cache.get("a")).toBe(2);
  });

  it("delete and clear drop entries", () => {
    const cache = createResourceCache<number>({ ttlMs: 1000, now: () => 0 });
    cache.set("a", 1);
    cache.set("b", 2);
    cache.delete("a");
    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toBe(2);
    cache.clear();
    expect(cache.get("b")).toBeUndefined();
  });
});
