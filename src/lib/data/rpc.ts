import { logger } from "@/lib/logger";
import { formatErrorForLog } from "@/lib/errors";

// Intentionally NOT `server-only` — crew-queries.ts uses this helper
// for both server-render and client (paging) flows, per the
// dual-context note in docs/architecture.md.

/**
 * Read-side adapter for Postgres RPCs. Concentrates the read contract
 * documented in docs/architecture.md and previously hand-rolled at
 * ~30 query sites:
 *
 *   1. Postgres error → swallow + log under a greppable tag + return
 *      the neutral fallback (`null` for single, `[]` for many).
 *   2. Data shape coercion:
 *      • RPCs that RETURNS TABLE come back as an array of rows; some
 *        RPCs that RETURNS RECORD or a scalar jsonb come back as a
 *        single value. `rpcSingle` accepts both and normalises to
 *        first-row-or-null.
 *      • `rpcMany` always coerces the data branch to an array.
 *
 * Mutation RPCs DON'T go through this — they need to throw or return
 * a discriminated `{ error }` per the mutation contract. See
 * `src/lib/data/*-mutations.ts`.
 *
 * The cast in the `return data as T` branch is the same kind of
 * output-side assertion documented in `json-shape.ts`: the contract
 * that the shape matches T lives in the migration that defines the
 * RPC. Callers that need richer validation (e.g. an RPC that some
 * older client may have populated with missing fields) should layer
 * a guard above the result.
 */

interface RpcResult {
  data: unknown;
  error: unknown;
}

export async function rpcSingle<T>(
  rpcPromise: PromiseLike<RpcResult>,
  failureTag: string,
): Promise<T | null> {
  const { data, error } = await rpcPromise;
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

export async function rpcMany<T>(
  rpcPromise: PromiseLike<RpcResult>,
  failureTag: string,
): Promise<T[]> {
  const { data, error } = await rpcPromise;
  if (error) {
    logger.warn(failureTag, { err: formatErrorForLog(error) });
    return [];
  }
  if (!Array.isArray(data)) return [];
  return data as T[];
}
