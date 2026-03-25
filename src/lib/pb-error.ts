import { ClientResponseError } from "pocketbase";

/**
 * Extract a human-readable error message from a PocketBase error,
 * including the status code and field-level validation errors.
 *
 * In development, includes the full response for debugging.
 * In production, only surfaces safe, user-facing messages.
 */
export function formatPBError(err: unknown): string {
  if (err instanceof ClientResponseError) {
    const parts: string[] = [];
    parts.push(`[${err.status}] ${err.message}`);

    const fieldErrors = err.response?.data;
    if (fieldErrors && typeof fieldErrors === "object") {
      for (const [field, detail] of Object.entries(fieldErrors)) {
        if (
          detail &&
          typeof detail === "object" &&
          "message" in (detail as Record<string, unknown>)
        ) {
          parts.push(
            `${field}: ${(detail as Record<string, unknown>).message}`
          );
        }
      }
    }

    // Only dump raw response in development — never leak internals in production
    if (parts.length === 1 && err.response && process.env.NODE_ENV !== "production") {
      parts.push(JSON.stringify(err.response));
    }

    return parts.join(" — ");
  }

  if (err instanceof Error) {
    return err.message;
  }

  return "Something went wrong";
}
