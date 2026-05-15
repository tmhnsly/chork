import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createDebouncer } from "./debouncer";

describe("createDebouncer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("fires flush(value) after delayMs", () => {
    const flush = vi.fn();
    const d = createDebouncer<number>({ delayMs: 800, flush });

    d.schedule(5);
    expect(flush).not.toHaveBeenCalled();

    vi.advanceTimersByTime(800);
    expect(flush).toHaveBeenCalledTimes(1);
    expect(flush).toHaveBeenCalledWith(5);
  });

  it("collapses consecutive schedule calls to one fire with the latest value", () => {
    const flush = vi.fn();
    const d = createDebouncer<number>({ delayMs: 800, flush });

    d.schedule(1);
    vi.advanceTimersByTime(200);
    d.schedule(2);
    vi.advanceTimersByTime(200);
    d.schedule(3);
    expect(flush).not.toHaveBeenCalled();

    vi.advanceTimersByTime(800);
    expect(flush).toHaveBeenCalledTimes(1);
    expect(flush).toHaveBeenCalledWith(3);
  });

  it("cancel after schedule produces no fire", () => {
    const flush = vi.fn();
    const d = createDebouncer<number>({ delayMs: 800, flush });

    d.schedule(5);
    d.cancel();
    vi.advanceTimersByTime(2000);
    expect(flush).not.toHaveBeenCalled();
  });

  it("flushPending fires immediately and prevents the scheduled timer from also firing", () => {
    const flush = vi.fn();
    const d = createDebouncer<number>({ delayMs: 800, flush });

    d.schedule(7);
    d.flushPending();
    expect(flush).toHaveBeenCalledTimes(1);
    expect(flush).toHaveBeenCalledWith(7);

    vi.advanceTimersByTime(2000);
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it("flushPending is a no-op when nothing is pending", () => {
    const flush = vi.fn();
    const d = createDebouncer<number>({ delayMs: 800, flush });

    d.flushPending();
    expect(flush).not.toHaveBeenCalled();
  });

  it("dispose with pending value fires synchronously with the latest value", () => {
    const flush = vi.fn();
    const d = createDebouncer<number>({ delayMs: 800, flush });

    d.schedule(42);
    expect(flush).not.toHaveBeenCalled();

    d.dispose();
    expect(flush).toHaveBeenCalledTimes(1);
    expect(flush).toHaveBeenCalledWith(42);

    // The original timer must not also fire.
    vi.advanceTimersByTime(2000);
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it("dispose with no pending value is a no-op", () => {
    const flush = vi.fn();
    const d = createDebouncer<number>({ delayMs: 800, flush });

    d.dispose();
    expect(flush).not.toHaveBeenCalled();
  });

  it("setFlush replaces the callback so the latest is invoked when the timer fires", () => {
    const first = vi.fn();
    const second = vi.fn();
    const d = createDebouncer<number>({ delayMs: 800, flush: first });

    d.schedule(99);
    d.setFlush(second);

    vi.advanceTimersByTime(800);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledWith(99);
  });

  it("setFlush takes effect on dispose-flush too", () => {
    const first = vi.fn();
    const second = vi.fn();
    const d = createDebouncer<number>({ delayMs: 800, flush: first });

    d.schedule(11);
    d.setFlush(second);
    d.dispose();

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledWith(11);
  });

  it("the value passed to schedule flows through (not anything captured earlier)", () => {
    const flush = vi.fn();
    const d = createDebouncer<{ kind: string; n: number }>({
      delayMs: 800,
      flush,
    });

    d.schedule({ kind: "first", n: 1 });
    d.schedule({ kind: "second", n: 2 });
    vi.advanceTimersByTime(800);

    expect(flush).toHaveBeenCalledTimes(1);
    expect(flush).toHaveBeenCalledWith({ kind: "second", n: 2 });
  });

  it("dispose is safe to call multiple times", () => {
    const flush = vi.fn();
    const d = createDebouncer<number>({ delayMs: 800, flush });

    d.schedule(3);
    d.dispose();
    d.dispose();
    d.dispose();
    expect(flush).toHaveBeenCalledTimes(1);
  });
});
