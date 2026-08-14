import { vi } from "vitest";

/**
 * The one Supabase test double. Every server-action / data-layer test
 * that needs a supabase client builds it here — never a local
 * `makeChain` fork. Thirteen forks of this harness existed before
 * 2026-08 (two byte-identical); each differed only in which chain
 * methods it listed, which meant every fork encoded the query shape
 * of its subject — a test broke when a query gained a `.gte()`, not
 * when behaviour changed.
 *
 * This harness avoids that by proxying: ANY method name chains, so a
 * test primes results and asserts behaviour (and, where the query
 * shape IS the behaviour — a mutation's payload, an .eq scoping a
 * write to the caller — asserts via the recorded `calls`).
 *
 * Capabilities (superset of what the forks built):
 *
 *   • Per-table / per-RPC priming:
 *       createMockSupabase({
 *         "table:profiles": { data: { username: "alice" } },
 *         "rpc:leave_crew_atomic": { data: "left" },
 *       })
 *   • Sequenced results — an array is consumed one entry per awaited
 *     chain, sticking on the last (insert-then-rollback flows):
 *       { "table:gyms": [{ data: { id: "g1" } }, { error: {...} }] }
 *   • Lazy results — a function re-evaluated per awaited chain.
 *   • Call recording — every chain call lands in `sb.calls` as
 *     `{ source, method, args }` where source is the table / RPC name,
 *     so a test can assert which tables were touched and with what:
 *       sb.calls.find((c) => c.source === "profiles" && c.method === "update")
 *   • `_resolveWith(result)` — fallback for every unprimed key (the
 *     original harness's whole API; still the cheapest way to script
 *     a single-query subject).
 *
 * The chain resolves wherever it's awaited (thenable), and
 * `.single()` / `.maybeSingle()` / any other method keep chaining —
 * so `await sb.from("x").select().eq().maybeSingle()` and
 * `await sb.rpc("y", args)` both work without listing methods.
 *
 * Pass the client anywhere a `SupabaseClient` is expected with
 * `as never` — the double is structural, not typed.
 */

export type SbError = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

export type SbResult = {
  data?: unknown;
  error?: SbError | null;
  count?: number | null;
};

export type PrimedResult = SbResult | SbResult[] | (() => SbResult);

export interface RecordedCall {
  /** Table name for `from(...)` chains, RPC name for `rpc(...)` calls. */
  source: string;
  method: string;
  args: unknown[];
}

/** Deterministic fixture UUID: testUuid("1") → "11111111-…". Pass 1–2
 *  hex chars; the seed is tiled to a valid UUID shape so every test
 *  file stops hand-rolling the same literal. */
export function testUuid(seed: string): string {
  const s = seed.padStart(2, seed).slice(0, 2).repeat(16);
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20, 32)}`;
}

export function createMockSupabase(
  primed: Record<string, PrimedResult> = {},
) {
  const results: Record<string, PrimedResult> = { ...primed };
  const cursors: Record<string, number> = {};
  const calls: RecordedCall[] = [];
  let fallback: SbResult = { data: null, error: null };

  const resolveFor = (key: string): SbResult => {
    const entry = results[key];
    if (entry === undefined) return fallback;
    if (typeof entry === "function") return entry();
    if (Array.isArray(entry)) {
      const i = cursors[key] ?? 0;
      cursors[key] = i + 1;
      return entry[Math.min(i, entry.length - 1)] ?? fallback;
    }
    return entry;
  };

  const makeChain = (source: string, key: string) => {
    const target = {
      then: (
        onFulfilled?: (v: SbResult) => unknown,
        onRejected?: (e: unknown) => unknown,
      ) => Promise.resolve(resolveFor(key)).then(onFulfilled, onRejected),
    };
    const chain: unknown = new Proxy(target, {
      get(t, prop) {
        if (prop === "then") return t.then;
        if (typeof prop !== "string") return undefined;
        return (...args: unknown[]) => {
          calls.push({ source, method: prop, args });
          return chain;
        };
      },
    });
    return chain as Record<string, (...args: unknown[]) => unknown> & {
      then: (typeof target)["then"];
    };
  };

  return {
    from: (table: string) => makeChain(table, `table:${table}`),
    rpc: (name: string, ...args: unknown[]) => {
      calls.push({ source: name, method: "rpc", args });
      return makeChain(name, `rpc:${name}`);
    },
    auth: {
      getUser: vi.fn(),
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
      admin: { deleteUser: vi.fn(), getUserById: vi.fn() },
    },
    storage: { from: vi.fn() },

    /** Every recorded chain call, in order. */
    calls,
    /** Prime (or re-prime) a key after construction. */
    prime(key: string, result: PrimedResult) {
      results[key] = result;
      delete cursors[key];
    },
    /** Fallback result for every key not explicitly primed. */
    _resolveWith(r: SbResult) {
      fallback = r;
    },
  };
}

export type MockSupabase = ReturnType<typeof createMockSupabase>;
