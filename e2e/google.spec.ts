import { test, expect } from "@playwright/test";

/**
 * Google sign-in: the handshake, against the live Supabase project.
 *
 * Nothing here signs in. A Google account is the one thing a test
 * must not create or use — so this stops at the edge of Google and
 * checks everything up to it, which is also most of what is OURS to
 * get wrong:
 *
 *   1. The button exists, sits above the form, and hands off.
 *   2. Supabase answers `/auth/v1/authorize?provider=google` with a
 *      302 to Google — i.e. the provider is ENABLED on the project.
 *      Disabled, it answers 400 "Unsupported provider" instead, which
 *      is exactly what the button did for a day.
 *   3. The redirect carries a Google client id and Supabase's own
 *      callback as `redirect_uri` — the value that has to match what
 *      was pasted into Google Cloud, or Google fails the sign-in
 *      with `redirect_uri_mismatch` before Supabase is reached.
 *   4. The `redirect_to` we asked for is our `/auth/callback` with
 *      `next` riding along — the form's wiring.
 *
 * What this cannot see, and why:
 *
 *   • The redirect ALLOW-LIST. Supabase validates `redirect_to`
 *     server-side and, if the origin is not listed, silently
 *     substitutes the Site URL; the validated value lives in the
 *     flow state and is only observable when Supabase sends the
 *     climber back — after Google. So "came back to /auth/callback
 *     and not to chork.app's root" is on the human checklist in
 *     docs/google-signin-setup.md. (A wrong list still signs in —
 *     the proxy routes the root to onboarding or the Card — it loses
 *     `?next=` and strands local dev on production.)
 *   • The consent screen's publishing status in Google Cloud. An app
 *     left in "Testing" admits only its listed test users and turns
 *     everyone else away at Google's door with "access blocked" — a
 *     launch-day failure that never touches our code. Same list.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");

test.describe("Google sign-in handshake", () => {
  test.skip(!SUPABASE_URL, "NEXT_PUBLIC_SUPABASE_URL is not set");

  test("the button leaves for Google, via Supabase, pointing back at our callback", async ({
    page,
    baseURL,
  }) => {
    await page.goto("/login");

    const button = page.getByRole("button", { name: /continue with google/i });
    await expect(button).toBeVisible();

    // Supabase's answer to the authorize request is the whole test:
    // a 302 to Google, whose Location carries the client id, the
    // callback and the signed state.
    const [authorize] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("/auth/v1/authorize"), { timeout: 20_000 }),
      button.click(),
    ]);

    if (authorize.status() !== 302) {
      const body = await authorize.text().catch(() => "");
      throw new Error(
        `Supabase did not redirect to Google (HTTP ${authorize.status()}): ${body.slice(0, 300)}\n` +
          "Is the Google provider enabled on the project? See docs/google-signin-setup.md §2.",
      );
    }

    const location = authorize.headers()["location"];
    expect(location, "authorize redirect has a Location").toBeTruthy();
    const google = new URL(location!);

    // 3. Google, with our client and Supabase's callback.
    expect(google.hostname).toBe("accounts.google.com");
    expect(google.searchParams.get("client_id")).toMatch(/\.apps\.googleusercontent\.com$/);
    expect(google.searchParams.get("redirect_uri")).toBe(`${SUPABASE_URL}/auth/v1/callback`);
    expect(google.searchParams.get("response_type")).toBe("code");
    expect(google.searchParams.get("scope") ?? "").toMatch(/email/);
    expect(google.searchParams.get("state"), "Supabase issued a flow state").toBeTruthy();

    // 4. Our side of the round trip: the form asked to come back to
    // /auth/callback, carrying `next`. GoTrue forwards the request's
    // remaining params to the provider, so the value we sent is
    // readable here — pre-validation, which is why the allow-list is
    // a human check (see the header).
    expect(google.searchParams.get("redirect_to")).toBe(`${baseURL}/auth/callback?next=%2F`);
  });

  test("the button is not the accent, and sits above the form", async ({ page }) => {
    // Accent means "this is yours / you did this" everywhere else in
    // the app; the primary action on this screen is whichever route
    // the climber chose, so Google must not out-rank the form for the
    // people who came to type a password. And it sits ABOVE the form:
    // one tap against eight fields, for someone with chalk on their
    // hands.
    await page.goto("/login");
    const button = page.getByRole("button", { name: /continue with google/i });
    const email = page.getByLabel(/email/i);
    const [b, e] = await Promise.all([button.boundingBox(), email.boundingBox()]);
    expect(b && e && b.y < e.y, "Google button renders above the email field").toBe(true);

    const accentSolid = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--accent-solid").trim(),
    );
    const buttonBg = await button.evaluate((el) => getComputedStyle(el).backgroundColor);
    // Resolve the token to an rgb() the same way the browser did.
    const accentRgb = await page.evaluate((v) => {
      const probe = document.createElement("span");
      probe.style.backgroundColor = v;
      document.body.appendChild(probe);
      const c = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return c;
    }, accentSolid);
    expect(buttonBg, "Google button is not painted in the accent").not.toBe(accentRgb);
  });
});
