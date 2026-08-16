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
  it("makes a role own its whole voice, resets included", () => {
    // `text-transform` and `font-style` are the only two axes that
    // would otherwise inherit: every other property the mixin writes
    // is written on every path, so an ancestor's value can't reach a
    // nested preset. These two were emitted only when the preset had
    // them — which is how a climber's handle shipped as "@TOM" on the
    // share card, `.handle` (meta) nested inside `.name` (label).
    //
    // Greps the mixin rather than the output because the call sites
    // are forbidden from setting these at all: with no reset in the
    // mixin the bug is unfixable in the module, only hideable.
    const mixin = readFileSync(
      join(process.cwd(), "src/styles/mixins/_typography.scss"),
      "utf8",
    );
    expect(mixin, "typography() must reset text-transform").toMatch(
      /text-transform:\s*none/,
    );
    expect(mixin, "typography() must reset font-style").toMatch(
      /font-style:\s*normal/,
    );
  });

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

  it("never hardcodes a breakpoint, in any unit", () => {
    // `px` alone isn't enough: onboarding had `@media (min-width: 30rem)`
    // — an ad-hoc breakpoint a few px off `cq.split` — which sailed past
    // a px-only check. Width media queries carry a number in *some*
    // unit, so match the unit rather than one spelling of it.
    expect(
      hits(
        allScss,
        /@media[^{]*\((min|max)-width:[^)]*[0-9]/,
        (p) => notTokenLayer(p) || notMarketing(p),
      ),
      "Use `bp.tablet` / `bp.desktop` for page layout and `cq.*` for " +
        "components. Both live in the mixin layer so a breakpoint is " +
        "named once, not re-guessed per file.",
    ).toEqual([]);
  });
});

describe("rings", () => {
  it("never passes a pixel number to ActivityRings or RingStatsRow", () => {
    const bad: string[] = [];
    for (const { path, text } of tsx) {
      if (path.endsWith("ring-sizes.ts")) continue;
      const re = /<(ActivityRings|RingStatsRow)\b[\s\S]{0,600}?\/>/g;
      for (const m of text.matchAll(re)) {
        if (/size=\{\s*[0-9]/.test(m[0])) bad.push(path);
      }
    }
    expect(
      bad,
      "Use a rung from `RING_SIZES` — preview / compact / card. Ring " +
        "sizes were 72, 72, 56 and a fourth about to be added, all raw, " +
        "which is how avatars ended up at 32, 36 and 40 for the same job.",
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

describe("interactive nesting", () => {
  // A <button> may not be a descendant of an <a>: invalid HTML, and
  // AT announces a link containing a button while keyboard users get
  // two stops. `LinkButton` renders a <Link> wearing the button
  // classes, which is what a "go somewhere" CTA wants.
  //
  // This shipped at 8 climber-facing sites while the primitive
  // existed and was used only in /admin — the rule is here because
  // the primitive alone clearly wasn't enough to hold the line.
  it("never nests <Button> inside <Link>", () => {
    const bad: string[] = [];
    for (const { path, text } of tsx) {
      // Non-greedy through the opening <Link ...> tag, then look for
      // a <Button before the matching </Link>.
      for (const m of text.matchAll(/<Link\b[\s\S]{0,600}?<\/Link>/g)) {
        if (/<Button\b/.test(m[0])) bad.push(path);
      }
    }
    expect(
      [...new Set(bad)],
      "Use <LinkButton href=…> — a link styled as a button. <Button> is " +
        "for 'do something', <Link>/<LinkButton> for 'go somewhere'.",
    ).toEqual([]);
  });
});

describe("tab panels", () => {
  it("gives every tabpanel its own layout", () => {
    // A `role="tabpanel"` wrapper is a child of the page's stack, so
    // it RECEIVES that gap and passes none on. Everything it contains
    // then has no vertical rhythm at all — which is how the
    // Chorkboard shipped with the podium's plinths butted straight
    // into rank 4 and every card below touching the one above.
    //
    // Nothing errors and nothing looks obviously wrong in review; it
    // just reads as cramped. So: a tabpanel must carry a className,
    // and it is on the author to make that class lay its children
    // out.
    const offenders = tsx.flatMap(({ path, text }) => {
      // The opening tag, from `<div` through the `>` that closes it.
      const tags = text.match(/<div[^>]*role="tabpanel"[^>]*>/g) ?? [];
      return tags
        .filter((tag) => !/className=/.test(tag))
        .map(() => relative(process.cwd(), path));
    });

    expect(
      offenders,
      "A tabpanel needs a className that lays its children out — "
        + "the page stack's gap stops at the panel, not inside it",
    ).toEqual([]);
  });
});

describe("tab semantics", () => {
  // `role="tab"` is a promise: AT announces "tab 2 of 3, selected"
  // and expects somewhere to move to. Ten surfaces made that promise
  // with no `role="tabpanel"` and no `aria-controls` anywhere in the
  // repo, because both tab controls hardcoded the role whether or not
  // the caller had a panel.
  //
  // Both now take an optional `panelId` and fall back to a
  // toggle-button group (role="group" + aria-pressed) without one, so
  // the roles are only emitted when they're true. This pins that:
  // outside those two primitives, nothing hand-rolls a tab role.
  const TAB_PRIMITIVES = ["components/ui/SegmentedControl", "components/ui/TabPills"];

  it("only the shared controls emit role=tab", () => {
    const bad = tsx
      .filter(({ path }) => !TAB_PRIMITIVES.some((p) => path.startsWith(p)))
      .filter(({ text }) => /role=["']tab["']|role=\{["']tab["']\}/.test(text))
      .map(({ path }) => path);
    expect(
      bad,
      "Use <SegmentedControl> / <TabPills>. They render the tabs " +
        "pattern only when given a `panelId`, and a toggle group " +
        "otherwise — so the role always matches reality.",
    ).toEqual([]);
  });

  it("every tabpanel is wired to a tab control", () => {
    // A panel with no `aria-labelledby` is the other half of the same
    // break: the tab points at the panel but the panel names nothing.
    const bad = tsx
      .filter(({ text }) => /role=["']tabpanel["']/.test(text))
      .filter(({ text }) => !/aria-labelledby=/.test(text))
      .map(({ path }) => path);
    expect(
      bad,
      "A role=tabpanel needs aria-labelledby={tabId(panelId, value)} " +
        "so it names the tab that selected it.",
    ).toEqual([]);
  });
});

describe("radiogroup semantics", () => {
  // `role="radio"` is the same kind of promise `role="tab"` is, and it
  // was broken the same way. Two components wrote the roles and
  // stopped: no roving tabindex, no key handler. AT announces a
  // composite widget, the user presses an arrow, and nothing happens —
  // worse than plain buttons, which at least behave as announced.
  // `ChoiceTiles` went as far as claiming arrow keys in its own doc
  // comment while implementing none.
  //
  // The contract lives in `useRadioGroup` now. This pins that nothing
  // hand-rolls the roles again, because fixing one of the two and not
  // the other is exactly how it happened.
  const RADIO_PRIMITIVES = [
    "components/ui/GradePicker",
    "components/ui/ChoiceTiles",
  ];

  it("only the shared controls emit role=radio", () => {
    const bad = tsx
      .filter(({ path }) => !RADIO_PRIMITIVES.some((p) => path.startsWith(p)))
      .filter(({ text }) => /role=["']radio["']|role=\{["']radio["']\}/.test(text))
      .map(({ path }) => path);
    expect(
      bad,
      "Use <GradePicker> for grades / <ChoiceTiles> for choices. Both " +
        "get roving tabindex and arrow-select from useRadioGroup, so " +
        "the roles match what the widget actually does.",
    ).toEqual([]);
  });

  it("every radiogroup gets its keyboard contract from the hook", () => {
    // The other half: a primitive could keep the roles and quietly
    // drop the hook, which is the state both were already in.
    const bad = tsx
      .filter(({ path }) => RADIO_PRIMITIVES.some((p) => path.startsWith(p)))
      .filter(({ path }) => !path.endsWith(".stories.tsx"))
      .filter(({ text }) => /role=["']radiogroup["']|groupProps/.test(text))
      .filter(({ text }) => !/useRadioGroup/.test(text))
      .map(({ path }) => path);
    expect(
      bad,
      "A radiogroup must take its roles from useRadioGroup — the roles " +
        "without the roving tabindex and arrow handler are a lie.",
    ).toEqual([]);
  });
});

describe("light/dark mechanism", () => {
  // Light/dark works through a coupling with no representation in
  // this repo: next-themes writes `class="dark"` on <html>, and the
  // matching `.dark` selector lives inside Radix's `*-dark.css`
  // files. Grep src/styles for `.dark` and you get nothing.
  //
  // Either half can be removed without a build error or a failing
  // test, leaving the app silently light-only. These two pin the
  // halves to each other.
  it("next-themes still supplies the .dark class", () => {
    const providers = readFileSync(
      join(SRC, "app", "providers.tsx"),
      "utf8",
    );
    expect(
      /<ThemeProvider[^>]*attribute="class"/.test(providers),
      'Dark mode depends on next-themes writing class="dark" on <html>, ' +
        "which is what Radix's *-dark.css selectors react to. Changing " +
        "this attribute makes the app light-only.",
    ).toBe(true);
  });

  it("the Radix dark scales are still imported", () => {
    const colors = readFileSync(
      join(SRC, "styles", "theme", "colors.scss"),
      "utf8",
    );
    expect(
      /@use "@radix-ui\/colors\/[a-z]+-dark\.css"/.test(colors),
      "The *-dark.css files carry the `.dark` selector. Without them " +
        "the class next-themes writes matches nothing.",
    ).toBe(true);
  });
});
