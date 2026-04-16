import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for end-to-end tests.
 *
 * Spawns `pnpm next start --port 4173` in the background. Tests run
 * against the production-mode build — same code path as Vercel
 * deploys, so cold-paint perf, SW behaviour, and middleware all
 * match what users will see.
 *
 * Local Chromium comes from `~/.cache/ms-playwright` (installed via
 * `npx playwright install chromium`). Set CHROME_PATH if you want
 * to use a different binary.
 */
export default defineConfig({
  testDir: "./e2e",
  // Snapshots stay alongside the test that produced them.
  snapshotPathTemplate: "{testDir}/{testFilePath}-snapshots/{arg}{ext}",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "list",

  use: {
    baseURL: "http://localhost:4173",
    trace: "on-first-retry",
    // The PWA cold-paint tests need an unprimed cache; per-test
    // contexts default-isolate cookies + storage which is what we
    // want for sign-in flows.
    contextOptions: {
      storageState: undefined,
    },
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    // Mobile Safari emulation — covers the PWA install + iOS bell
    // surface area. Add when needed; not enabled by default to keep
    // local runs fast.
    // {
    //   name: "mobile-safari",
    //   use: { ...devices["iPhone 14 Pro"] },
    // },
  ],

  webServer: {
    command: "pnpm next start --port 4173",
    port: 4173,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
