/**
 * Discriminated-union result type returned by every server action in
 * the app. The success branch may carry extra fields (`gymId`,
 * `competitionId`, etc) via the type parameter; the error branch is
 * always a single user-facing message string ready to feed into
 * `showToast(res.error, "error")`.
 *
 * Callers narrow with `if ("error" in res)` to fork. Keep this shape
 * stable — `formatError` / `formatErrorForLog` in `lib/errors.ts`
 * already produce the canonical error message, so action authors
 * never construct the union manually beyond `{ error: "..." }` or
 * `{ success: true, ...payload }`.
 */
export type ActionResult<T = unknown> =
  | { error: string }
  | ({ success: true } & T);
