/**
 * Structured JSON logger.
 *
 * Every log line lands in Vercel's log explorer as a JSON object so
 * fields are filterable (`event:route_log_failed`,
 * `level:error`) without grepping free-text. The previous pattern —
 * `console.warn("[chork] X failed:", err)` — buried the signal
 * inside a string that log tooling can't pivot on.
 *
 * Contract:
 *   • `event` — snake_case identifier, should be stable across calls
 *     so you can count occurrences over time.
 *   • `fields` — arbitrary JSON-serialisable context. Never include
 *     PII that shouldn't leave the server (emails, raw tokens).
 *     Use `formatErrorForLog` from `@/lib/errors` for error
 *     objects — it already preserves PG code + message + hint.
 *
 * `info` / `warn` go to stdout; `error` goes to stderr so Vercel's
 * log explorer categorises them into the Errors bucket automatically.
 *
 * Safe on both the server and the client — only depends on
 * `console`. Sentry integration (later in this same remediation pass)
 * hooks the error boundary separately; this logger stays transport-
 * agnostic.
 */

type Level = "info" | "warn" | "error";
type Fields = Record<string, unknown>;

interface LogPayload extends Fields {
  level: Level;
  event: string;
  ts: string;
}

function emit(level: Level, event: string, fields: Fields): void {
  const payload: LogPayload = {
    level,
    event,
    ts: new Date().toISOString(),
    ...fields,
  };
  // JSON.stringify handles the escaping. We serialise once so the
  // sink receives a single well-formed line per event, making
  // structured log ingestion (Vercel, Datadog, etc.) trivial.
  const line = JSON.stringify(payload);
  if (level === "error") {
    console.error(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  info: (event: string, fields: Fields = {}) => emit("info", event, fields),
  warn: (event: string, fields: Fields = {}) => emit("warn", event, fields),
  error: (event: string, fields: Fields = {}) => emit("error", event, fields),
};
