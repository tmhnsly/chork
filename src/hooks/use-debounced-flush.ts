"use client";

import { useEffect, useState } from "react";
import { createDebouncer, type Debouncer } from "@/lib/debouncer";

interface Options<T> {
  /**
   * Window in ms before the scheduled value fires. Read at mount —
   * changes after the first render are ignored (the hook's use case
   * is constant timer windows). If you need a dynamic window, rebuild
   * the component or pass the value through `schedule(value)` itself.
   */
  delayMs: number;
  /**
   * Called with the latest scheduled value when the debounce window
   * expires, when `flushPending()` is invoked, or when the component
   * unmounts with a pending value. Receives the value as an argument
   * — never close over state here; resolve "latest context" (other
   * coupled fields) inside the callback body via your own refs.
   *
   * Callback identity can change between renders; the latest is
   * always used (installed via commit-phase effect).
   */
  flush: (value: T) => void | Promise<void>;
}

/**
 * React wrapper around `createDebouncer`. Single source of truth for
 * the debounce-with-flush-on-unmount pattern — do not re-roll the
 * timer/pending/latest-flush trio inline. See `src/lib/debouncer.ts`
 * for the pure logic + tests.
 */
export function useDebouncedFlush<T>({ delayMs, flush }: Options<T>): Pick<
  Debouncer<T>,
  "schedule" | "cancel" | "flushPending"
> {
  // Lazy initializer — runs once per mount, gives a stable reference
  // for the lifetime of the component without a useRef + render-time
  // .current read (which the `react-hooks/refs` lint rule forbids).
  const [debouncer] = useState<Debouncer<T>>(() =>
    createDebouncer({ delayMs, flush }),
  );

  // Keep the latest flush callback installed. Commit-phase write so
  // the async timer / unmount cleanup see the freshest closure.
  useEffect(() => {
    debouncer.setFlush(flush);
  });

  // Unmount → flush any pending value via the latest callback.
  useEffect(() => {
    return () => {
      debouncer.dispose();
    };
  }, [debouncer]);

  return {
    schedule: debouncer.schedule,
    cancel: debouncer.cancel,
    flushPending: debouncer.flushPending,
  };
}
