import { logger } from "@/lib/logger";
import { formatErrorForLog } from "@/lib/errors";

// Intentionally NOT `server-only` — crew-queries.ts uses these helpers
// for both server-render and client (paging) flows, per the
// dual-context note in docs/architecture.md.

/**
 * Read-side adapter for Supabase reads — covers both Postgres RPCs
 * (`supabase.rpc(...)`) and table SELECTs (`supabase.from(...).select(...)`).
 * Both produce the same `{ data, error }` thenable, so one pair of
 * helpers handles both.
 *
 * Concentrates the read contract documented in docs/architecture.md
 * and previously hand-rolled at ~40 query sites:
 *
 *   1. Postgres error → swallow + log under a greppable tag + return
 *      the neutral fallback (`null` for single, `[]` for many).
 *   2. Data shape coercion:
 *      • `readSingle` normalises both shapes — a single row from
 *        `.maybeSingle()` / `.single()` / a scalar jsonb RPC, OR the
 *        first row of an array (RPC RETURNS TABLE returns `[row]`,
 *        `.from().select().limit(1)` without `.maybeSingle()` ditto).
 *      • `readMany` coerces the data branch to an array.
 *
 * Mutation calls DON'T go through this — they need to throw or return
 * a discriminated `{ error }` per the mutation contract. See
 * `src/lib/data/*-mutations.ts`.
 *
 * The cast in the `return data as T` branch is the same kind of
 * output-side assertion documented in `json-shape.ts`: the contract
 * that the shape matches T lives in the migration that defines the
 * RPC, or in the column types of the table being read. Callers that
 * need richer validation (e.g. an RPC that some older client may
 * have populated with missing fields) should layer a guard above
 * the result.
 */

interface ReadResult {
  data: unknown;
  error: unknown;
}

export async function readSingle<T>(
  promise: PromiseLike<ReadResult>,
  failureTag: string,
): Promise<T | null> {
  const { data, error } = await promise;
  if (error) {
    logger.warn(failureTag, { err: formatErrorForLog(error) });
    return null;
  }
  if (data == null) return null;
  if (Array.isArray(data)) {
    return (data[0] ?? null) as T | null;
  }
  return data as T;
}

export async function readMany<T>(
  promise: PromiseLike<ReadResult>,
  failureTag: string,
): Promise<T[]> {
  const { data, error } = await promise;
  if (error) {
    logger.warn(failureTag, { err: formatErrorForLog(error) });
    return [];
  }
  if (!Array.isArray(data)) return [];
  return data as T[];
}
