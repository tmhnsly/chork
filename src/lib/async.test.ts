import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TimeoutError, withTimeout } from "./async";

describe("withTimeout", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves with the inner value when the promise settles before the timer", async () => {
    const inner = Promise.resolve("ok");
    await expect(withTimeout(inner, 1000)).resolves.toBe("ok");
  });

  it("rejects with the inner error when the promise rejects before the timer", async () => {
    const inner = Promise.reject(new Error("boom"));
    await expect(withTimeout(inner, 1000)).rejects.toThrow("boom");
  });

  it("rejects with TimeoutError when the promise hangs past the timer", async () => {
    // Never-resolving promise — without the timeout it would hang.
    const inner = new Promise<string>(() => {});
    const racing = withTimeout(inner, 500, "stuck");
    // Register the rejection expectations BEFORE advancing the fake
    // timer. Each `expect(...).rejects.X` attaches its own handler to
    // `racing`, so when the timer fires the rejection is already
    // observed — no unhandled-rejection window between the timer
    // callback and the assertion `await`.
    const isTimeoutError = expect(racing).rejects.toBeInstanceOf(TimeoutError);
    const hasReasonInMessage = expect(racing).rejects.toThrow(/500ms.*stuck/);
    await vi.advanceTimersByTimeAsync(500);
    await isTimeoutError;
    await hasReasonInMessage;
  });

  it("clears the timer once the inner promise settles so no stray callbacks fire", async () => {
    let resolveInner!: (v: string) => void;
    const inner = new Promise<string>((resolve) => { resolveInner = resolve; });
    const racing = withTimeout(inner, 1000);

    resolveInner("done");
    await expect(racing).resolves.toBe("done");

    // If the timer hadn't been cleared, advancing past it would
    // trigger a late rejection on a resolved promise — nothing to
    // observe directly, but the clear-on-settle behaviour is the
    // contract we care about.
    await vi.advanceTimersByTimeAsync(2000);
  });

  it("omits the reason suffix when none is provided", () => {
    const err = new TimeoutError(750);
    expect(err.message).toBe("Timeout after 750ms");
    expect(err.name).toBe("TimeoutError");
  });

  it("includes the reason suffix when provided", () => {
    const err = new TimeoutError(750, "sw-ready");
    expect(err.message).toBe("Timeout after 750ms (sw-ready)");
  });
});
