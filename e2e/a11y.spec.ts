import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Axe-core a11y gate. Runs against the public surface after JS
 * hydration completes so client-only components (NavBar, theme
 * decorators, dynamic icons) are in their final state.
 *
 * The lhci pipeline asserts the SAME audits at the page level via
 * Lighthouse's bundled axe-core. This per-route Playwright run
 * gives more granular failure context (per-rule + per-node) so
 * regressions surface in the test output instead of a JSON report.
 *
 * Storybook component-level a11y testing is the longer-term home
 * for this — once @storybook/addon-vitest's plugin loader is
 * fixed (currently fails on dynamic-import path resolution under
 * pnpm hoisting), `parameters.a11y.test = "error"` in preview.ts
 * picks up the gate per-story automatically.
 */

// Test each public route in BOTH color schemes — Chork supports
// light + dark and a contrast regression in either is a regression.
const ROUTES = ["/", "/login", "/privacy"] as const;
const SCHEMES = ["light", "dark"] as const;

for (const route of ROUTES) {
  for (const scheme of SCHEMES) {
    test(`${route} (${scheme}) has no axe violations`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(route);
      // Theme provider sets html.class on hydration — small wait so
      // the rendered colours match the scheme axe reads.
      await page.waitForLoadState("networkidle");
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      expect(results.violations, formatViolations(results.violations)).toEqual([]);
    });
  }
}

/**
 * Pretty-print axe violations as the assertion message so a CI
 * failure points at the rule + node + impact directly. Avoids
 * scrolling through `expect([{ huge node mess }]).toEqual([])`.
 */
function formatViolations(violations: Awaited<ReturnType<AxeBuilder["analyze"]>>["violations"]): string {
  if (violations.length === 0) return "no violations";
  return violations
    .map((v) => {
      const nodes = v.nodes.slice(0, 3).map((n) => `  ${n.target.join(" / ")}`).join("\n");
      return `[${v.impact}] ${v.id}: ${v.help}\n${nodes}`;
    })
    .join("\n\n");
}
