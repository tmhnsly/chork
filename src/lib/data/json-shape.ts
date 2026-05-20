/**
 * Output-side type assertions for Supabase `Json` / `jsonb` values.
 *
 * Postgres RPC functions that return jsonb, and `jsonb` columns
 * (e.g. `notifications.payload`), come back from the Supabase client
 * as the generated `Json` type — a recursive primitive-or-object
 * union. TypeScript can't narrow `Json` to a specific shape without
 * a hop through `unknown`, so every caller used to scatter
 * `(data ?? null) as unknown as MyShape` across the data layer.
 *
 * These helpers name the intent in one place:
 *   • `asJsonShape` — assert a single value is some shape T.
 *   • `asJsonShapeArray` — same for an array.
 *
 * This is an **output-side** assertion only. The contract that the
 * shape is correct lives in the migration / RPC definition that
 * produced the value. NEVER use these to cast input on the way IN —
 * input lies are the bug class we're trying to keep out of the
 * codebase. For inputs, validate explicitly with a guard.
 *
 * If a payload's shape ever turns out to be uncertain at the call
 * site (e.g. a column written by older client versions that didn't
 * carry every field), replace `asJsonShape` with a Zod parse or a
 * hand-rolled type predicate at that one site.
 */
export function asJsonShape<T>(value: unknown): T {
  return value as T;
}

export function asJsonShapeArray<T>(value: unknown): T[] {
  return (Array.isArray(value) ? value : []) as T[];
}

/**
 * Widening direction: a known JSON-serialisable value (a typed
 * interface whose fields are all strings / numbers / booleans / etc.)
 * needs to be passed where the API wants the generated `Json` type.
 *
 * TypeScript refuses the assignment even though every concrete field
 * IS Json — it can't structurally relate a closed interface to Json's
 * `[key: string]: Json | undefined` index signature without an
 * explicit assertion. Single site for the cast keeps the lie
 * documented and grep-able.
 *
 * Use only at the boundary of an RPC / table-insert whose generated
 * type is `Json`. The caller is asserting the value IS JSON-shaped at
 * runtime, which is invariably true for the typed payload shapes we
 * pass through (string fields only).
 */
import type { Json } from "@/lib/database.types";

export function toJson<T>(value: T): Json {
  return value as unknown as Json;
}
