import { describe, it, expect } from "vitest";
import { shellFromCookie } from "./NavBarShell";
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
