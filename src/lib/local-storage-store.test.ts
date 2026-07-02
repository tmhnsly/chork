import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createLocalStorageStore,
  createSnapshotReader,
} from "./local-storage-store";

// ── Pure half: raw → value pipeline ─────────────────────────

describe("createSnapshotReader", () => {
  it("parses JSON by default", () => {
    const read = createSnapshotReader<{ a: number }>({});
    expect(read('{"a":1}')).toEqual({ a: 1 });
  });

  it("returns null for a missing raw value", () => {
    const read = createSnapshotReader<number>({});
    expect(read(null)).toBeNull();
  });

  it("treats corrupt entries as misses instead of throwing", () => {
    const read = createSnapshotReader<{ a: number }>({});
    expect(read("{not json")).toBeNull();
  });

  it("memoises per raw string — same raw in, SAME REFERENCE out", () => {
    // useSyncExternalStore loops forever if getSnapshot returns a
    // fresh object each call; this is the load-bearing contract.
    const read = createSnapshotReader<{ a: number }>({});
    const first = read('{"a":1}');
    const second = read('{"a":1}');
    expect(second).toBe(first);
  });

  it("re-parses when the raw value changes", () => {
    const read = createSnapshotReader<{ a: number }>({});
    const first = read('{"a":1}');
    const second = read('{"a":2}');
    expect(second).not.toBe(first);
    expect(second).toEqual({ a: 2 });
    // And memoises the new value.
    expect(read('{"a":2}')).toBe(second);
  });

  it("supports a custom parse (ack-count style) — falsy values still count", () => {
    const read = createSnapshotReader<number>({
      parse: (raw) => Number.parseInt(raw, 10) || 0,
    });
    expect(read("7")).toBe(7);
    expect(read("garbage")).toBe(0); // NaN coerces to 0, not a miss
  });

  it("rejects entries failing isValid", () => {
    const read = createSnapshotReader<{ id?: string }>({
      isValid: (v) => !!v.id,
    });
    expect(read('{"id":"x"}')).toEqual({ id: "x" });
    expect(read("{}")).toBeNull();
  });

  it("rejects entries past their TTL", () => {
    let now = 0;
    const read = createSnapshotReader<{ at: number }>({
      ttlMs: 1000,
      timestampOf: (v) => v.at,
      now: () => now,
    });
    now = 1000; // exactly at TTL — still valid (`> ttl` expires)
    expect(read('{"at":0}')).toEqual({ at: 0 });
    now = 1002;
    expect(read('{"at":1}')).toBeNull(); // 1002 - 1 > 1000
  });

  it("evaluates TTL only when the raw value changes (inherited semantics)", () => {
    // The original profile-cache impl memoised on raw and only
    // re-checked TTL on change — an entry read once keeps being
    // served for the session. Pin that so the swap is behaviourless.
    let now = 0;
    const read = createSnapshotReader<{ at: number }>({
      ttlMs: 1000,
      timestampOf: (v) => v.at,
      now: () => now,
    });
    const fresh = read('{"at":0}');
    expect(fresh).toEqual({ at: 0 });
    now = 5000; // way past TTL, raw unchanged
    expect(read('{"at":0}')).toBe(fresh);
  });
});

// ── Store: window/localStorage wiring (stubbed) ─────────────

class FakeStorage {
  private map = new Map<string, string>();
  throwOnAccess = false;
  getItem(key: string): string | null {
    if (this.throwOnAccess) throw new Error("blocked");
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    if (this.throwOnAccess) throw new Error("blocked");
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    if (this.throwOnAccess) throw new Error("blocked");
    this.map.delete(key);
  }
}

class FakeWindow extends EventTarget {
  localStorage = new FakeStorage();
}

function stubWindow(): FakeWindow {
  const win = new FakeWindow();
  vi.stubGlobal("window", win);
  return win;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createLocalStorageStore", () => {
  it("is SSR-safe: null snapshots and no-op write/subscribe without a window", () => {
    const store = createLocalStorageStore<number>("k", { eventName: "evt" });
    expect(store.getSnapshot()).toBeNull();
    expect(store.getServerSnapshot()).toBeNull();
    expect(() => store.write(1)).not.toThrow();
    expect(() => store.subscribe(() => {})()).not.toThrow();
  });

  it("round-trips a write through storage into the snapshot", () => {
    stubWindow();
    const store = createLocalStorageStore<{ n: number }>("k", { eventName: "evt" });
    expect(store.getSnapshot()).toBeNull();
    store.write({ n: 3 });
    expect(store.getSnapshot()).toEqual({ n: 3 });
    // Stable across repeat reads.
    expect(store.getSnapshot()).toBe(store.getSnapshot());
  });

  it("write(null) removes the entry", () => {
    stubWindow();
    const store = createLocalStorageStore<number>("k", { eventName: "evt" });
    store.write(5);
    expect(store.getSnapshot()).toBe(5);
    store.write(null);
    expect(store.getSnapshot()).toBeNull();
  });

  it("notifies same-tab subscribers via the custom event on write", () => {
    stubWindow();
    const store = createLocalStorageStore<number>("k", { eventName: "evt" });
    const cb = vi.fn();
    const unsubscribe = store.subscribe(cb);
    store.write(1);
    expect(cb).toHaveBeenCalledTimes(1);
    unsubscribe();
    store.write(2);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("subscribers hear the native storage event (other-tab writes)", () => {
    const win = stubWindow();
    const store = createLocalStorageStore<number>("k", { eventName: "evt" });
    const cb = vi.fn();
    store.subscribe(cb);
    win.dispatchEvent(new Event("storage"));
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("still dispatches the event when storage is blocked, and reads degrade to null", () => {
    const win = stubWindow();
    win.localStorage.throwOnAccess = true;
    const store = createLocalStorageStore<number>("k", { eventName: "evt" });
    const cb = vi.fn();
    store.subscribe(cb);
    expect(() => store.write(1)).not.toThrow();
    expect(cb).toHaveBeenCalledTimes(1); // subscribers stay coherent
    expect(store.getSnapshot()).toBeNull();
  });

  it("uses the custom serializer (ack-count style)", () => {
    const win = stubWindow();
    const store = createLocalStorageStore<number>("ack", {
      eventName: "evt",
      parse: (raw) => Number.parseInt(raw, 10) || 0,
      serialize: String,
    });
    store.write(4);
    expect(win.localStorage.getItem("ack")).toBe("4");
    expect(store.getSnapshot()).toBe(4);
  });
});
