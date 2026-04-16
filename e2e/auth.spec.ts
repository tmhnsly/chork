import { test, expect } from "@playwright/test";

/**
 * Authentication flow tests against the live Supabase project.
 *
 * Required env vars (set in .env.local or CI secrets):
 *   E2E_TEST_EMAIL     — pre-created test user
 *   E2E_TEST_PASSWORD  — that user's password
 *
 * Without them, the suite skips. We DON'T sign up new users
 * inside the test — that would pollute production with throwaway
 * accounts on every run.
 *
 * The test user should be:
 *   - Already onboarded (so login doesn't redirect to /onboarding)
 *   - Have an active_gym_id pointing at a real gym
 *   - Idempotent across runs (clean state isn't required — the
 *     tests assert UI shape, not specific row counts)
 */

const TEST_EMAIL = process.env.E2E_TEST_EMAIL;
const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD;

test.describe("auth flow", () => {
  test.skip(!TEST_EMAIL || !TEST_PASSWORD, "E2E_TEST_EMAIL / E2E_TEST_PASSWORD not set");

  test("sign-in redirects to the wall + nav reflects authed state", async ({ page }) => {
    await page.goto("/login");

    // Form labelled inputs catch a11y regressions too.
    await page.getByLabel(/email/i).fill(TEST_EMAIL!);
    await page.getByLabel(/password/i).fill(TEST_PASSWORD!);

    // Submit + wait for the redirect target.
    await Promise.all([
      page.waitForURL((url) => url.pathname === "/" || url.pathname.startsWith("/onboarding"), {
        timeout: 15_000,
      }),
      page.getByRole("button", { name: /sign in/i }).click(),
    ]);

    // Authenticated wall: the nav surfaces the climber tabs (Wall /
    // Board / Crew / Profile + optional Admin). The Wall tab should
    // be present + active.
    const wallTab = page.getByRole("link", { name: /wall/i });
    await expect(wallTab).toBeVisible({ timeout: 10_000 });
  });

  test("sign-in honours ?next= for deep-link redirect", async ({ page }) => {
    // Use /leaderboard as a known protected route that authed users
    // can reach.
    await page.goto("/login?next=%2Fleaderboard");
    await page.getByLabel(/email/i).fill(TEST_EMAIL!);
    await page.getByLabel(/password/i).fill(TEST_PASSWORD!);

    await Promise.all([
      page.waitForURL((url) => url.pathname.startsWith("/leaderboard"), { timeout: 15_000 }),
      page.getByRole("button", { name: /sign in/i }).click(),
    ]);

    // Made it to the leaderboard, not bounced back to /login.
    expect(page.url()).toContain("/leaderboard");
  });

  test("sign-in surfaces an error toast for wrong password", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/email/i).fill(TEST_EMAIL!);
    await page.getByLabel(/password/i).fill("definitely-wrong-password");
    await page.getByRole("button", { name: /sign in/i }).click();

    // Toast lives in the role=status container (react-hot-toast).
    // Loose match — the exact message comes from Supabase auth.
    await expect(
      page.getByText(/invalid|incorrect|wrong|credentials/i),
    ).toBeVisible({ timeout: 10_000 });

    // Should NOT have navigated.
    expect(page.url()).toContain("/login");
  });
});
