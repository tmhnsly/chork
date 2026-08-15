import localFont from "next/font/local";

/**
 * Every font the app loads, in one place.
 *
 * Self-hosted rather than pulled from Google — see `src/fonts/README.md`
 * for why, and for the three-step recipe to swap a family.
 *
 * The contract with the design system is the `variable` name and
 * nothing else. `src/styles` reads `--font-outfit` / `--font-inter` /
 * `--font-display-italic`, and every `@include type.typography(...)`
 * resolves through those, so a family can be replaced here without a
 * single change under `src/styles`.
 *
 * All three are **variable** fonts covering their whole weight axis in
 * one file, so adding a weight to a preset costs no extra download.
 * `weight: "100 900"` is what tells the browser that — omit it and it
 * synthesises intermediate weights by smearing the glyphs.
 */

export const outfit = localFont({
  src: "../fonts/outfit-latin.woff2",
  weight: "100 900",
  style: "normal",
  variable: "--font-outfit",
  display: "swap",
  // Roughly Outfit's own metrics, so the fallback holds the same space
  // and text doesn't reflow when the real face arrives. Only meaningful
  // while `display: swap` is showing the fallback.
  adjustFontFallback: "Arial",
  fallback: ["system-ui", "sans-serif"],
});

export const inter = localFont({
  src: "../fonts/inter-latin.woff2",
  weight: "100 900",
  style: "normal",
  variable: "--font-inter",
  display: "swap",
  // Preloaded, unlike before. It used to be skipped because Inter came
  // from Google — a third-party DNS + TLS + round-trip that wasn't
  // worth a preload slot on first paint. Self-hosted it is one more
  // file on a connection we already have, and it backs `body`, `meta`
  // and `button` — 179 call sites, i.e. most of the text on screen. Not
  // preloading it means that text paints in the fallback first and
  // visibly reflows, which is the one way the body copy can look
  // different from before.
  preload: true,
  adjustFontFallback: "Arial",
  fallback: ["system-ui", "sans-serif"],
});

/**
 * Real italic for display surfaces.
 *
 * Outfit ships no italic, so every `font-style: italic` on the heading
 * family was being browser-synthesised by skewing the upright glyph.
 * Synth-italic glyphs overhang their advance-width box, which iOS
 * Safari paints outside the layout box and then clips — the right edge
 * of an italic heading would shave off. A real italic reports correct
 * advance widths, so it doesn't.
 *
 * Archivo: neutral grotesque, weight to 900, real italic axis. Picked
 * after a side-by-side trial across DM Sans, Hanken Grotesk, Plus
 * Jakarta, Mona/Hubot and Public Sans — it holds the most consistent
 * character against Outfit Black upright while keeping the grid
 * numbers (01 / 02 / 03 / 04) readable.
 */
export const archivoItalic = localFont({
  src: "../fonts/archivo-italic-latin.woff2",
  // The italic file we ship is subset to the display weights actually
  // used; declaring the true range stops the browser synthesising a
  // 400 that isn't in there.
  weight: "700 900",
  style: "italic",
  variable: "--font-display-italic",
  display: "swap",
  fallback: ["system-ui", "sans-serif"],
});

/** Every font variable, ready for the `<html>` className. */
export const fontVariables = [
  outfit.variable,
  inter.variable,
  archivoItalic.variable,
].join(" ");
