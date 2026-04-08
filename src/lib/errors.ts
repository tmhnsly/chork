import type { PostgrestError } from "@supabase/supabase-js";

/**
 * Extract a human-readable error message from a Supabase error.
 */
export function formatError(err: unknown): string {
  // Supabase PostgrestError
  if (err && typeof err === "object" && "code" in err && "message" in err) {
    const pgErr = err as PostgrestError;
    const parts = [pgErr.message];
    if (pgErr.details) parts.push(pgErr.details);
    if (pgErr.hint && process.env.NODE_ENV !== "production") {
      parts.push(pgErr.hint);
    }
    return parts.join(" — ");
  }

  if (err instanceof Error) {
    return err.message;
  }

  return "Something went wrong";
}
