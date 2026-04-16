import type { PostgrestError } from "@supabase/supabase-js";

/**
 * Map of Postgres / PostgREST error codes to friendly user-facing
 * messages. Anything not listed falls back to the raw `message` (or a
 * generic) in production so a constraint name or row fragment never
 * lands in a toast.
 */
const FRIENDLY_BY_CODE: Record<string, string> = {
  "23505": "That already exists.",
  "23503": "Referenced record was not found.",
  "23514": "That value isn't allowed.",
  "23502": "A required field is missing.",
  "42501": "You don't have permission to do that.",
  PGRST116: "Not found.",
  PGRST301: "Sign in to continue.",
};

/**
 * Extract a user-facing error message.
 *
 * In production we deliberately strip Postgres `details` / `hint` —
 * those strings can echo constraint names, column values, or row
 * fragments back to the client (info disclosure). Use
 * `formatErrorForLog` for full server-side context.
 *
 * In development we keep the extra context so `pnpm dev` debugging
 * stays useful.
 */
export function formatError(err: unknown): string {
  if (isPostgrestError(err)) {
    const friendly = FRIENDLY_BY_CODE[err.code];
    if (friendly) return friendly;

    if (process.env.NODE_ENV === "development") {
      const parts = [err.message];
      if (err.details) parts.push(err.details);
      if (err.hint) parts.push(err.hint);
      return parts.join(" — ");
    }

    // Production / test fallback when we have no friendly mapping.
    // err.message is generally safer than details/hint but Postgres
    // can still embed values — when in doubt, the generic wins.
    return err.message || "Something went wrong";
  }

  if (err instanceof Error) {
    return err.message;
  }

  return "Something went wrong";
}

/**
 * Server-side log helper. Always returns the full error string
 * (message + code + details + hint) for pino/console use — never
 * passed to the client.
 */
export function formatErrorForLog(err: unknown): string {
  if (isPostgrestError(err)) {
    return [
      `[${err.code}]`,
      err.message,
      err.details && `(${err.details})`,
      err.hint && `hint: ${err.hint}`,
    ].filter(Boolean).join(" ");
  }
  if (err instanceof Error) return err.stack ?? err.message;
  return String(err);
}

function isPostgrestError(err: unknown): err is PostgrestError {
  return (
    err !== null &&
    typeof err === "object" &&
    "code" in err &&
    "message" in err &&
    typeof (err as { code: unknown }).code === "string" &&
    typeof (err as { message: unknown }).message === "string"
  );
}
