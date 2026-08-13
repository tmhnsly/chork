import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Design-system invariants.
 *
 * Every rule below was, at some point, violated across dozens of
 * files — not through carelessness but because the token scale was
 * missing a rung, so the nearest thing to hand was a literal. The
 * scales have the rungs now. These tests stop the literals coming
 * back while nobody is looking.
 *
 * Each failure message names the rung to reach for instead. A rule
 * you cannot satisfy is a rule with a missing token behind it —
 * add the token rather than widening an exemption here.
 *
 * Marketing surfaces (`components/landing/`, `app/gyms/`) are exempt
 * from the size and rhythm rules by decision, not by oversight: they
 * are container-relative illustrations tuned against `cqi` inside
 * fixed-aspect boxes, which the app scales don't model, and they are
 * due a homepage refresh of their own. Everything else — colour,
 * motion, breakpoints — still applies to them.
 */

const SRC = join(process.cwd(), "src");

/** Decorative marketing illustrations — container-relative art, not
 *  app chrome. Sizes there are tuned against `cqi` in a fixed-aspect
 *  box, which the app scales don't model. Excluded knowingly, and due
 *  a refresh of their own. */
const MARKETING = ["components/landing/", "app/gyms/"];

/** The token layer defines the primitives, so it is allowed to use
 *  literals the rest of the app may not. */
const TOKEN_LAYER = ["styles/theme/", "styles/mixins/"];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const ALL = walk(SRC);

const scssModules = ALL.filter((f) => f.endsWith(".module.scss")).map((f) => ({
  path: relative(SRC, f),
  text: readFileSync(f, "utf8"),
}));

const allScss = ALL.filter((f) => f.endsWith(".scss")).map((f) => ({
  path: relative(SRC, f),
  text: readFileSync(f, "utf8"),
}));

const tsx = ALL.filter((f) => f.endsWith(".tsx")).map((f) => ({
  path: relative(SRC, f),
  text: readFileSync(f, "utf8"),
}));

/** Collect `file:line  text` hits, skipping comment lines. */
function hits(
  files: { path: string; text: string }[],
  re: RegExp,
  skip: (path: string) => boolean = () => false,
): string[] {
  const found: string[] = [];
  for (const { path, text } of files) {
    if (skip(path)) continue;
    text.split("\n").forEach((line, i) => {
      const code = line.replace(/\/\/.*$/, "");
      if (code.trim().startsWith("*") || code.trim().startsWith("/*")) return;
      if (re.test(code)) found.push(`${path}:${i + 1}  ${line.trim()}`);
    });
  }
  return found;
}

const notMarketing = (p: string) => MARKETING.some((d) => p.startsWith(d));
const notTokenLayer = (p: string) => TOKEN_LAYER.some((d) => p.startsWith(d));

describe("type scale", () => {
  it("never sets a raw letter-spacing value", () => {
    // Note the lookahead sits before the whitespace, not after: with
    // `\s*(?!…)` the star backtracks to zero and the lookahead passes
    // on the space, flagging every legitimate token use.
    expect(
      hits(scssModules, /letter-spacing:(?!\s*var\(--tracking)/),
      "Tracking comes with the step — `typography(role, $step)` sets it. " +
        "Twenty hand-picked values drifted here before, with larger text " +
        "somehow carrying wider tracking than small. Surfaces that style " +
        "themselves via `type.italic-display` may name a `--tracking-*` " +
        "token directly; nobody may write a number.",
    ).toEqual([]);
  });

  it("never sets a raw px/rem font-size", () => {
    expect(
      hits(
        scssModules,
        /font-size:\s*[0-9.]+(px|rem)\s*;/,
        notMarketing,
      ),
      "Use `typography(role, $step)` for text, or a `--size-icon-*` rung " +
        "for a standalone glyph. Relative units (`em`, `cqi`) are fine and " +
        "are how an icon tracks the text beside it.",
    ).toEqual([]);
  });

  it("never sets a raw line-height", () => {
    expect(
      hits(scssModules, /line-height:(?!\s*var\(--leading)/, notMarketing),
      "Leading comes with the step. A single-line role that needs to opt " +
        "out says so in the preset table (`leading: none|tight|ui`) — " +
        "twelve components had hand-set it under a preset, agreeing with " +
        "each other to within 0.05, which is what those three tokens now " +
        "encode. A glyph centred in a fixed box uses `--leading-none`.",
    ).toEqual([]);
  });

  it("keeps the sub-floor rung reachable only via the icon-label preset", () => {
    expect(
      hits(scssModules, /var\(--text-(2xs|icon-label)\)/),
      "10px is for a word captioning a glyph, and the `icon-label` preset " +
        "is the only route to it. If there's no icon carrying the meaning, " +
        "the floor is 12px (`--text-xs`).",
    ).toEqual([]);
  });
});

describe("state + colour", () => {
  it("never dims a disabled control with opacity", () => {
    const bad: string[] = [];
    for (const { path, text } of allScss) {
      const lines = text.split("\n");
      lines.forEach((line, i) => {
        if (!/:disabled/.test(line)) return;
        // Same line (one-liner form) or the next three.
        const window = lines.slice(i, i + 4).join("\n");
        if (/opacity:\s*0?\.\d+/.test(window)) bad.push(`${path}:${i + 1}`);
      });
    }
    expect(
      bad,
      "Use `state.disabled` / `state.disabled-bare`. Opacity scales " +
        "contrast toward the background, so an AA-compliant control " +
        "silently stops being one — and it dims the focus ring too.",
    ).toEqual([]);
  });

  it("never open-codes color-mix in a component", () => {
    expect(
      hits(allScss, /color-mix\(/, notTokenLayer),
      "Mix at the token layer (`theme/surfaces.scss`, `mixins/_surfaces.scss`) " +
        "and consume the token, the way `--skeleton-glow` and `surface.scrim` do.",
    ).toEqual([]);
  });

  it("never open-codes a raw rgb/rgba colour", () => {
    expect(
      hits(allScss, /\brgba?\(/, (p) => notTokenLayer(p) || notMarketing(p)),
      "Use a Radix token, or add a named one to the token layer with the " +
        "reason — `--overlay-media` and `--shadow-glyph` are the precedent.",
    ).toEqual([]);
  });

  it("never hand-rolls a focus ring", () => {
    expect(
      hits(scssModules, /outline-offset:/),
      "Use `focus.ring` / `focus.ring-inset`. Hand-rolled rings drifted to " +
        "`--accent-border` (step 7) while the mixin uses `--focus-ring` " +
        "(step 8), so the focus indicator changed colour around the app.",
    ).toEqual([]);
  });
});

describe("motion", () => {
  it("never sets a raw duration", () => {
    expect(
      hits(
        scssModules,
        /(transition|animation)(-duration)?:[^;]*\b[0-9.]+m?s\b/,
        notMarketing,
      ),
      "Use `--duration-*`. State changes and loops are separate axes — " +
        "`--duration-spin` / `--duration-shimmer` exist so a spinner " +
        "doesn't borrow a state-change token.",
    ).toEqual([]);
  });

  it("never inlines a cubic-bezier", () => {
    expect(
      hits(allScss, /cubic-bezier\(/, notTokenLayer),
      "Use an `--ease-*` token so the app keeps one motion character.",
    ).toEqual([]);
  });
});

describe("layout", () => {
  it("uses container queries inside components, not viewport width", () => {
    expect(
      hits(
        scssModules.filter((f) => f.path.startsWith("components/")),
        /@media\s*\((max|min)-width/,
      ),
      "A component should respond to its own container (`cq.split`, " +
        "`cq.at()`), not the window — the same panel in a narrow column on " +
        "a wide screen needs to stack. Page-level layout may use `bp.*`.",
    ).toEqual([]);
  });

  it("never hardcodes a px breakpoint", () => {
    expect(
      hits(allScss, /@media[^{]*[0-9]+px/, (p) => notTokenLayer(p) || notMarketing(p)),
      "Use `bp.tablet` / `bp.desktop` for page layout, `cq.*` for " +
        "components. Six ad-hoc values (480/600/720px) drifted here before.",
    ).toEqual([]);
  });
});

describe("avatars", () => {
  it("never passes a pixel number to UserAvatar", () => {
    expect(
      hits(tsx, /<UserAvatar[^>]*size=\{[0-9]/),
      'Use a role name — size="row", size="hero". Pixel numbers are how ' +
        "the same list-row avatar ended up at 32, 36 and 40.",
    ).toEqual([]);
  });

  it("never hardcodes a size on a UserAvatar call spanning lines", () => {
    const bad: string[] = [];
    for (const { path, text } of tsx) {
      const re = /<UserAvatar\b[\s\S]{0,400}?\/>/g;
      for (const m of text.matchAll(re)) {
        if (/size=\{\s*[0-9]/.test(m[0])) bad.push(path);
      }
    }
    expect(bad, "Same rule, multi-line JSX form.").toEqual([]);
  });
});
