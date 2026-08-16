import { describe, it, expect } from "vitest";
import { shellFromCookie, isAdminFromCookie } from "./NavBarShell";
import { sign, verify } from "@/lib/cookie-sign";

/**
 * The nav's first-byte shell comes from a signed cookie, and the two
 * halves of that sentence disagreed in production for a while: the
 * proxy wrote `sign(value)` while this component compared the raw
 * cookie against `"awg"`. Wherever `CHORK_COOKIE_SECRET` is set — which
 * is everywhere that matters — the comparison could never match, so
 * every authed page server-rendered the signed-out nav and corrected
 * it on hydration. Nothing failed loudly; it just flashed, and the
 * signed-out nav's links fired RSC prefetches for pages the climber
 * was never shown.
 *
 * These pin both directions: the mapping itself, and the fact that a
 * raw signed value is NOT a valid input to it.
 */
describe("shellFromCookie", () => {
  it("maps the three cookie states", () => {
    expect(shellFromCookie("awg")).toBe("authed-with-gym");
    expect(shellFromCookie("ang")).toBe("authed-no-gym");
    expect(shellFromCookie("u")).toBe("unauthed");
  });

  it("reads the gym half of an admin value", () => {
    // The admin flag is a suffix, so a value carrying it must still
    // resolve to the same shell — otherwise turning someone into an
    // admin would silently hide Wall and Board from them.
    expect(shellFromCookie("awga")).toBe("authed-with-gym");
    expect(shellFromCookie("anga")).toBe("authed-no-gym");
  });

  it("falls back to unauthed for missing / unknown values", () => {
    expect(shellFromCookie(null)).toBe("unauthed");
    expect(shellFromCookie("")).toBe("unauthed");
    expect(shellFromCookie("nonsense")).toBe("unauthed");
  });

  it("does not accept a still-signed value", () => {
    // `sign()` produces `${value}.${sig}`. Passing that straight in is
    // the bug: it looks like it should work, and quietly doesn't.
    expect(shellFromCookie("awg.Ab3dEfGhIjKlMnOpQrStUv")).toBe("unauthed");
    expect(shellFromCookie("ang.Ab3dEfGhIjKlMnOpQrStUv")).toBe("unauthed");
  });

  it("accepts what verify() returns, for both signed and bare cookies", async () => {
    // `src/test/setup.ts` sets a throwaway secret, so this runs the
    // real HMAC path: `sign` wraps, `verify` unwraps. That is the
    // contract the component depends on, and the branch that was
    // previously untested in every suite.
    for (const [value, expected] of [
      ["awg", "authed-with-gym"],
      ["ang", "authed-no-gym"],
      ["u", "unauthed"],
    ] as const) {
      expect(shellFromCookie(await verify(await sign(value)))).toBe(expected);
    }
  });
});

/**
 * The Admin tab used to appear a frame after hydration on every page
 * load, because the server had no way to know: the shell cookie
 * carried gym state and nothing else. The trailing "a" is that bit.
 */
describe("isAdminFromCookie", () => {
  it("reads the admin suffix", () => {
    expect(isAdminFromCookie("awga")).toBe(true);
    expect(isAdminFromCookie("anga")).toBe(true);
  });

  it("is false for every non-admin value", () => {
    expect(isAdminFromCookie("awg")).toBe(false);
    expect(isAdminFromCookie("ang")).toBe(false);
    expect(isAdminFromCookie("u")).toBe(false);
  });

  it("fails closed on missing, unknown or still-signed values", () => {
    // Wrong way round matters here. A missing tab appears on
    // hydration; a wrongly-shown one flashes an entry point the
    // viewer cannot use.
    expect(isAdminFromCookie(null)).toBe(false);
    expect(isAdminFromCookie("")).toBe(false);
    expect(isAdminFromCookie("nonsense")).toBe(false);
    expect(isAdminFromCookie("awga.Ab3dEfGhIjKlMnOpQrStUv")).toBe(false);
  });
});
