/**
 * One rule for suites that need credentials: never disappear quietly.
 *
 * A suite that self-skips when its env is missing is the right call
 * locally — a fresh clone shouldn't fail because it has no service
 * key. But the same mechanism is how a whole layer can stop running
 * and nobody notices. That already happened twice here: the Storybook
 * vitest project failed to load for months while the run still
 * reported a green unit total, and the e2e suite sat on a real WCAG
 * violation and a test asserting a 404 was a 200, because nothing ran
 * it.
 *
 * So skipping is allowed, but it has to be:
 *
 *   • **Loud.** Print exactly which suite was skipped and which
 *     variables would make it run. A line in the output is the
 *     difference between "I chose not to run this" and "I didn't know
 *     this existed".
 *
 *   • **Refusable.** Set `CHORK_STRICT_TESTS=1` and a missing
 *     prerequisite becomes a hard failure instead. That's what CI
 *     should set once its secrets exist, so the suite can never
 *     silently shrink back.
 */

export interface SkipReport {
  /** Suite name as it should appear in output. */
  suite: string;
  /** Env vars the suite needs, in the order a human should set them. */
  requires: string[];
}

/** True when the runner has been told that skipping is not acceptable. */
export const strictTests = process.env.CHORK_STRICT_TESTS === "1";

/**
 * Decide whether a credentialed suite can run, announcing the answer.
 *
 * Returns `true` when every required var is present. Otherwise prints
 * which are missing and returns `false` — or throws, under
 * `CHORK_STRICT_TESTS=1`.
 */
export function canRun({ suite, requires }: SkipReport): boolean {
  const missing = requires.filter((key) => !process.env[key]);
  if (missing.length === 0) return true;

  const message =
    `${suite}: SKIPPED — missing ${missing.join(", ")}. ` +
    `Set ${missing.length > 1 ? "them" : "it"} to run this suite.`;

  if (strictTests) {
    throw new Error(
      `${message}\nCHORK_STRICT_TESTS=1 is set, so a skipped suite is a failure.`,
    );
  }

  // `warn` rather than `log`: this belongs with the run's other
  // diagnostics, not buried in test output.
  console.warn(`\n⚠︎  ${message}\n`);
  return false;
}
