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
 * Where an auth error should be surfaced in the login form. Field
 * targets render inline under the relevant input; `general` falls
 * back to a toast (rate limits, infra, unknown).
 */
export type AuthErrorField = "email" | "password" | "general";

export interface FormattedAuthError {
  message: string;
  field: AuthErrorField;
}

/**
 * Supabase Auth error code → friendly copy + field target. Codes
 * come from `@supabase/auth-js` v2. Some older/edge errors only
 * carry a message string, so `formatAuthError` falls back to
 * substring matching below the table.
 */
const AUTH_ERROR_BY_CODE: Record<string, FormattedAuthError> = {
  invalid_credentials: {
    message: "Email or password is incorrect.",
    field: "password",
  },
  email_not_confirmed: {
    message: "Confirm your email before signing in — check your inbox.",
    field: "email",
  },
  user_already_exists: {
    message: "An account with this email already exists. Try signing in.",
    field: "email",
  },
  user_already_registered: {
    message: "An account with this email already exists. Try signing in.",
    field: "email",
  },
  weak_password: {
    message: "Password is too weak — use at least 8 characters.",
    field: "password",
  },
  same_password: {
    message: "New password must be different from your current one.",
    field: "password",
  },
  over_email_send_rate_limit: {
    message: "Too many attempts. Try again in a minute.",
    field: "general",
  },
  over_request_rate_limit: {
    message: "Too many attempts. Try again in a minute.",
    field: "general",
  },
  signup_disabled: {
    message: "Sign-ups are currently disabled.",
    field: "general",
  },
  email_address_invalid: {
    message: "That email address doesn't look right.",
    field: "email",
  },
};

/**
 * Turn a Supabase Auth error into form-friendly copy + target field.
 * Unknown errors route to `general` so the toast catches them; known
 * ones pin inline under the relevant input so the user sees exactly
 * what needs fixing.
 */
export function formatAuthError(err: unknown): FormattedAuthError {
  if (isAuthLikeError(err)) {
    if (err.code && AUTH_ERROR_BY_CODE[err.code]) {
      return AUTH_ERROR_BY_CODE[err.code];
    }

    // Pre-code Supabase responses only carry `message` — substring
    // match the common phrasings so upgrading the auth SDK doesn't
    // regress the UX on older deployments.
    const msg = err.message.toLowerCase();
    if (msg.includes("invalid login credentials")) {
      return AUTH_ERROR_BY_CODE.invalid_credentials;
    }
    if (msg.includes("email not confirmed")) {
      return AUTH_ERROR_BY_CODE.email_not_confirmed;
    }
    if (msg.includes("rate limit")) {
      return AUTH_ERROR_BY_CODE.over_request_rate_limit;
    }
    if (
      msg.includes("already registered") ||
      msg.includes("already exists")
    ) {
      return AUTH_ERROR_BY_CODE.user_already_exists;
    }
  }

  return {
    message: "Something went wrong. Please try again.",
    field: "general",
  };
}

function isAuthLikeError(
  err: unknown,
): err is { message: string; code?: string; status?: number } {
  return (
    err !== null &&
    typeof err === "object" &&
    "message" in err &&
    typeof (err as { message: unknown }).message === "string"
  );
}

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
