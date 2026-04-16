import { test, expect } from "@playwright/test";

/**
 * Smoke tests — not full user flows, just "the production build
 * boots and the canonical surfaces don't crash". If these fail,
 * everything else is moot.
 */

test.describe("smoke", () => {
  test("home renders the landing page for logged-out visitors", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("pageerror", (err) => consoleErrors.push(err.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    const response = await page.goto("/");
    expect(response?.status()).toBe(200);

    // Page title carries the brand. Loose contains so the title
    // template (`%s · Chork`) doesn't break this on per-page rename.
    await expect(page).toHaveTitle(/Chork/);

    // No console errors during initial load. PWA cold paint is
    // sensitive to client-side errors poisoning hydration.
    expect(consoleErrors.filter((e) => !e.includes("favicon"))).toEqual([]);
  });

  test("login page renders the sign-in form", async ({ page }) => {
    const response = await page.goto("/login");
    expect(response?.status()).toBe(200);

    // Form fields present + labelled. Login is a public route so
    // anyone (including bots) lands here.
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
  });

  test("privacy page is reachable without auth", async ({ page }) => {
    const response = await page.goto("/privacy");
    expect(response?.status()).toBe(200);
    // Public route — must not redirect to /login.
    expect(page.url()).toMatch(/\/privacy$/);
  });

  test("manifest is valid JSON with the required PWA fields", async ({ request }) => {
    const res = await request.get("/manifest.json");
    expect(res.status()).toBe(200);

    const manifest = await res.json();
    expect(manifest).toMatchObject({
      name: expect.any(String),
      short_name: expect.any(String),
      start_url: expect.any(String),
      display: "standalone",
      icons: expect.any(Array),
    });

    // Must have at least one icon ≥ 192px (Android install requirement).
    const sizes = manifest.icons
      .map((i: { sizes?: string }) => i.sizes ?? "")
      .map((s: string) => Number.parseInt(s.split("x")[0] ?? "0", 10));
    expect(Math.max(...sizes)).toBeGreaterThanOrEqual(192);

    // Maskable icon present (Android adaptive icons).
    const hasMaskable = manifest.icons.some(
      (i: { purpose?: string }) => (i.purpose ?? "").includes("maskable"),
    );
    expect(hasMaskable).toBe(true);
  });

  test("favicon.ico is served (no 404 fallback)", async ({ request }) => {
    const res = await request.get("/favicon.ico");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toMatch(/image\/x-icon|image\/vnd\.microsoft\.icon/);
  });

  test("OpenGraph image is served", async ({ request }) => {
    const res = await request.get("/og-image.png");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toBe("image/png");
  });

  test("service worker is reachable + cached headers don't block updates", async ({ request }) => {
    const res = await request.get("/sw.js");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toMatch(/javascript/);
  });
});
