/**
 * Playwright twin of `src/test/skip-guard.ts` — same rule, separate
 * file because the e2e suite runs under Playwright, not vitest, and
 * shares no module graph with `src/`.
 *
 * A credentialed spec may skip, but it must say so, and it must be
 * possible to forbid skipping. `CHORK_STRICT_TESTS=1` turns a missing
 * prerequisite into a failure — that is what CI sets once its secrets
 * exist, so the layer can't quietly shrink back to nothing.
 */

export interface SkipReport {
  suite: string;
  requires: string[];
}

export const strictTests = process.env.CHORK_STRICT_TESTS === "1";

/**
 * Returns a reason string when the suite cannot run (suitable for
 * `test.skip(cond, reason)`), or `null` when it can. Throws instead
 * under `CHORK_STRICT_TESTS=1`.
 */
export function skipReason({ suite, requires }: SkipReport): string | null {
  const missing = requires.filter((key) => !process.env[key]);
  if (missing.length === 0) return null;

  const reason = `${suite}: missing ${missing.join(", ")}`;

  if (strictTests) {
    throw new Error(
      `${reason}\nCHORK_STRICT_TESTS=1 is set, so a skipped suite is a failure.`,
    );
  }

  console.warn(`\n⚠︎  SKIPPED — ${reason}. Set them to run this suite.\n`);
  return reason;
}
