# Marketing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the logged-out homepage with an Apple-product-page-shaped page whose imagery is the real app mounted inside a device frame, with scroll-driven state changes per section.

**Architecture:** The page is a sequence of sections, each one claim plus the product doing the thing. Every device on the page mounts real `components/ui` primitives (`SendGridTile`, `RankStrip`, `Podium`, `LeaderboardRow`, the `LogSheet` primitives) with fixture data; what a device shows at a given scroll step is a pure function (`cardScreenAt(step)` etc.) with a unit test per step, and a small scroll-progress hook only supplies the step. Two feature components (`Podium`, `RankStrip`) are lifted to `components/ui` so the landing page never imports across features; a `TileGrid` primitive replaces the grid rule `SendsGrid` and the landing page both need.

**Tech Stack:** Next.js 15 App Router, React 19 (`inert`), SCSS modules on the existing token system, Vitest. No animation library; `position: sticky` + `IntersectionObserver` + `requestAnimationFrame` + CSS transitions.

**Spec:** `docs/superpowers/specs/2026-09-30-marketing-page-design.md`

## Global Constraints

- **No commits or pushes without Tom's go-ahead** (house rule, memory `feedback_no_auto_commit`). Each task ends at a *checkpoint* with the commit message ready; ask once, then commit. Work on `main`.
- Copy rules (spec): plain headings; "game" is the app's word, "competition" is allowed on the page, **never "match"**; "free to join" only, **never "free forever"/"always free"/"for life"**; **no attempt count for anyone but "you"**, including in fixtures; no counters, testimonials or gym names; "leaderboard", **never "Chorkboard"**; no real gym or brand names in fixtures.
- Design-system rules apply to `components/landing/` with **no exemption** once Task 9 lands: typography only via `@include type.typography(role, $step)`; no raw `font-size`/`line-height`/`letter-spacing`; colour, spacing, radius, motion via tokens; no `color-mix`/`rgba`/`cubic-bezier` literals; `bp.*` mixins for viewport breakpoints (never a literal `@media (min-width`); `style={{}}` only pipes custom properties; disabled via `state.*`; no numeric `<UserAvatar size>`.
- Motion (spec): copy never waits on scroll; only device state and short arrival fades are scroll-linked; pins release within three viewport-heights; arrivals `--duration-normal` on `--ease-out` (never `--ease-out-expo`); `prefers-reduced-motion` renders the **end** state, pins become normal flow; every `animation`/`transition` on tokens.
- Performance invariants (CLAUDE.md): no `new Date()`/`Date.now()` in a render body; no synchronous `setState` in a `useEffect` body (callbacks are fine); `react-icons/fa6` barrel import only.
- Cross-feature imports (`@/components/<feature>/*` from another feature) are a lint warning and a house rule violation; the landing page imports only from `components/ui`, `components/motion`, `lib`, `hooks` and its own folder.
- Verify with `pnpm check` (typecheck + typecheck:test + lint + tests) **and** `npx sass --load-path=src/styles --no-source-map <file>` on every new stylesheet, because neither eslint nor vitest compiles Sass.

---

## File structure

**Tokens (modify)**
- `src/styles/theme/typography.scss` — add `6xl` / `7xl` steps (+ caps modifiers)
- `src/styles/mixins/_typography.scss` — allow the two new steps
- `src/styles/theme/radius.scss` — `--radius-5`, `--radius-inner-5-3` (device bezel)
- `src/styles/theme/spacing.scss` — `--size-device-h`, `--size-board-row`

**Hooks (create)**
- `src/lib/scroll-progress.ts` (+ `.test.ts`) — `pinProgress`, `stepAt`: pure
- `src/hooks/use-scroll-progress.ts` — `useScrollProgress(ref)`, `useInView(ref)`
- `src/hooks/use-reduced-motion.ts` — `useReducedMotion()`

**Primitives (lift / create)**
- `src/components/ui/Podium/{Podium.tsx,PodiumSkeleton.tsx,podium.module.scss}` ← moved from `components/Leaderboard/`
- `src/components/ui/RankStrip/{RankStrip.tsx,rankStrip.module.scss}` ← moved from `components/SendsGrid/`
- `src/components/ui/TileGrid/{TileGrid.tsx,tileGrid.module.scss}` — the 4-column tile grid; `SendsGrid` adopts it

**Landing (create, all under `src/components/landing/`)**
- `copy.ts` — every string on the page; `copy.test.ts` pins the copy rules
- `fixtures.ts` — set, routes, your logs, climbers, ranks, the game; `fixtures.test.ts` pins attempt privacy
- `screens/cardScreen.ts`, `screens/boardScreen.ts`, `screens/gameScreen.ts` (+ tests) — pure step → props
- `DeviceFrame.tsx`, `deviceFrame.module.scss`
- `CardScreen.tsx`, `cardScreen.module.scss` — rank strip + legend + tiles + in-device log sheet
- `BoardRows.tsx`, `boardRows.module.scss` — slot-positioned `LeaderboardRow`s (used by board and game screens)
- `BoardScreen.tsx` — `Podium` + `BoardRows`
- `GameScreen.tsx`, `gameScreen.module.scss` — game header + tiles + `BoardRows`
- `Section.tsx`, `section.module.scss` — `SectionCopy`, `PinnedSection`, `ArrivalSection`
- `Hero.tsx`, `hero.module.scss`
- `Ladder.tsx`, `ladder.module.scss`
- `QuietGrid.tsx`, `quietGrid.module.scss`
- `MadeBy.tsx`, `Close.tsx`, `closing.module.scss`
- `Screens.stories.tsx` — the three device screens at every step

**Page (rewrite)**
- `src/app/landing.tsx`, `src/app/landing.module.scss`

**Delete**
- `src/components/landing/variants/` (whole folder), the `?variant=` branch in `src/app/page.tsx`
- `src/components/landing/{DemoTile,HeroGrid,FeatureGrid,HowItWorksSection,ScoringSection,FadeIn,InView,HeroSection}.tsx` + their `.module.scss` + `.stories.tsx`
- `MARKETING` exemption in `src/styles/design-system.test.ts`; `/how-it-works` in `src/app/robots.ts`

`SiteFooter` stays as is.

---

### Task 1: Type steps, device radius, size tokens

**Files:**
- Modify: `src/styles/theme/typography.scss:106-108` (after the `5xl` block), `:135` (caps modifiers)
- Modify: `src/styles/mixins/_typography.scss:55`
- Modify: `src/styles/theme/radius.scss:7`, `:20`
- Modify: `src/styles/theme/spacing.scss:32`

**Interfaces:**
- Produces: type steps `6xl` (60px) and `7xl` (72px) usable as `$step`; tokens `--radius-5`, `--radius-inner-5-3`, `--size-device-h`, `--size-board-row`.

- [ ] **Step 1: Add the two steps to the token layer**

In `src/styles/theme/typography.scss`, directly after the `--tracking-5xl: -0.02em;` line:

```scss
  /* Marketing display. The app's largest title is 48px; a product
     page's hero is not a page title, it is a poster, and at 48px on a
     1440 screen it reads as a card heading. Two rungs above, on the
     same curve: tracking keeps tightening, leading keeps closing. */
  --text-6xl: 3.75rem; /* 60px */
  --leading-6xl: 1.05;
  --tracking-6xl: -0.025em;

  --text-7xl: 4.5rem; /* 72px */
  --leading-7xl: 1;
  --tracking-7xl: -0.03em;
```

After `--tracking-caps-5xl: 0em;` add:

```scss
  --tracking-caps-6xl: 0em;
  --tracking-caps-7xl: 0em;
```

- [ ] **Step 2: Allow them in the mixin**

In `src/styles/mixins/_typography.scss` change

```scss
$_steps: xs, sm, md, lg, xl, 2xl, 3xl, 4xl, 5xl;
```
to
```scss
$_steps: xs, sm, md, lg, xl, 2xl, 3xl, 4xl, 5xl, 6xl, 7xl;
```

- [ ] **Step 3: Radius and size tokens**

In `src/styles/theme/radius.scss`, after the `--radius-4` line:

```scss
  --radius-5: 1.75rem;   // 28px — a device's corner (marketing DeviceFrame)
```

After `--radius-inner-4-6`:

```scss
  --radius-inner-5-3: max(0px, calc(var(--radius-5) - var(--space-3)));
```

In `src/styles/theme/spacing.scss`, after `--size-rank-strip: 4.25rem;`:

```scss
  // A LeaderboardRow's natural height: the 44px touch target plus
  // --space-3 above and below. The marketing board positions rows in
  // slots (so a row can slide past another) and a slot has to be
  // exactly one row tall.
  --size-board-row: 4.25rem;
  // The screen of the marketing DeviceFrame. Tall enough for a rank
  // strip, the legend and three rows of tiles; short enough to fit
  // under a headline on a phone-height viewport.
  --size-device-h: 36rem;
```

- [ ] **Step 4: Compile-check the token layer and run the design-system tests**

Run: `npx sass --load-path=src/styles --no-source-map src/styles/index.scss > /dev/null && pnpm test --run src/styles`

(If the entry file isn't `index.scss`, use whatever `src/app/layout.tsx` imports from `src/styles/`.)
Expected: sass exits 0; design-system tests PASS.

- [ ] **Step 5: Checkpoint**

Ready to commit as `feat(tokens): two display steps above 5xl, a device radius, two marketing sizes`.

---

### Task 2: Scroll progress — pure functions, then hooks

**Files:**
- Create: `src/lib/scroll-progress.ts`, `src/lib/scroll-progress.test.ts`
- Create: `src/hooks/use-scroll-progress.ts`, `src/hooks/use-reduced-motion.ts`

**Interfaces:**
- Produces:
  - `pinProgress(top: number, height: number, viewport: number): number` — 0..1
  - `stepAt(progress: number, steps: number): number` — 0..steps-1
  - `useScrollProgress(ref: RefObject<HTMLElement | null>): number`
  - `useInView(ref: RefObject<HTMLElement | null>, threshold?: number): boolean` — latches true
  - `useReducedMotion(): boolean`

- [ ] **Step 1: Write the failing tests**

`src/lib/scroll-progress.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { pinProgress, stepAt } from "./scroll-progress";

describe("pinProgress", () => {
  // A pinned section is `height` tall in a `viewport` tall window. Its
  // sticky child is pinned from the moment the section's top reaches
  // the viewport top (progress 0) until its bottom reaches the
  // viewport bottom (progress 1).
  it("is 0 while the section top is at or below the viewport top", () => {
    expect(pinProgress(0, 3000, 1000)).toBe(0);
    expect(pinProgress(400, 3000, 1000)).toBe(0);
  });
  it("is 1 once the section bottom has reached the viewport bottom", () => {
    expect(pinProgress(-2000, 3000, 1000)).toBe(1);
    expect(pinProgress(-2600, 3000, 1000)).toBe(1);
  });
  it("is linear across the travel between", () => {
    expect(pinProgress(-1000, 3000, 1000)).toBeCloseTo(0.5);
    expect(pinProgress(-500, 3000, 1000)).toBeCloseTo(0.25);
  });
  it("a section no taller than the viewport is 0 until it is scrolled past, then 1", () => {
    expect(pinProgress(10, 800, 1000)).toBe(0);
    expect(pinProgress(-1, 800, 1000)).toBe(1);
  });
});

describe("stepAt", () => {
  it("spreads the steps evenly over the travel, the last one held to the end", () => {
    expect(stepAt(0, 4)).toBe(0);
    expect(stepAt(0.24, 4)).toBe(0);
    expect(stepAt(0.25, 4)).toBe(1);
    expect(stepAt(0.5, 4)).toBe(2);
    expect(stepAt(0.99, 4)).toBe(3);
    expect(stepAt(1, 4)).toBe(3);
  });
  it("one step is always step 0", () => {
    expect(stepAt(0, 1)).toBe(0);
    expect(stepAt(1, 1)).toBe(0);
  });
  it("clamps a stray progress outside 0..1", () => {
    expect(stepAt(-0.2, 3)).toBe(0);
    expect(stepAt(1.4, 3)).toBe(2);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm test --run src/lib/scroll-progress.test.ts`
Expected: FAIL — cannot find module `./scroll-progress`.

- [ ] **Step 3: Implement the pure functions**

`src/lib/scroll-progress.ts`:

```ts
/**
 * How far through its pin a scroll-driven section is.
 *
 * A pinned section is a tall block whose sticky child holds the
 * viewport while the block scrolls underneath. Its progress is 0 the
 * moment the block's top reaches the viewport top and 1 the moment
 * its bottom reaches the viewport bottom — the sticky child is
 * pinned for exactly that travel, so this is the only number a
 * section needs.
 *
 * @param top      the block's `getBoundingClientRect().top`
 * @param height   the block's height
 * @param viewport the viewport height
 */
export function pinProgress(top: number, height: number, viewport: number): number {
  const travel = height - viewport;
  if (travel <= 0) return top < 0 ? 1 : 0;
  return clamp(-top / travel, 0, 1);
}

/** Which of `steps` states a progress maps to, evenly, the last held to the end. */
export function stepAt(progress: number, steps: number): number {
  if (steps <= 1) return 0;
  return Math.min(steps - 1, Math.floor(clamp(progress, 0, 1) * steps));
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm test --run src/lib/scroll-progress.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: The hooks**

`src/hooks/use-reduced-motion.ts`:

```ts
"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void): () => void {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

const read = () => window.matchMedia(QUERY).matches;
// The server can't know; it says "no", and the client snapshot
// corrects it before paint — the same shape as useViewTransitionsEnabled.
const serverRead = () => false;

/** Whether the viewer has asked for reduced motion. Live, not a mount-time read. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, read, serverRead);
}
```

`src/hooks/use-scroll-progress.ts`:

```ts
"use client";

import { useEffect, useState, type RefObject } from "react";
import { pinProgress } from "@/lib/scroll-progress";

/**
 * 0..1 through a pinned section's travel (see `pinProgress`).
 *
 * Cheap by construction: an IntersectionObserver turns the scroll
 * listener on only while the section is on screen, and the listener
 * reads layout at most once per frame. When the section leaves, one
 * last read settles the value at 0 or 1 so a section scrolled past
 * quickly still ends in its end state.
 */
export function useScrollProgress(ref: RefObject<HTMLElement | null>): number {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let raf = 0;
    let listening = false;

    const read = () => {
      raf = 0;
      const rect = el.getBoundingClientRect();
      setProgress(pinProgress(rect.top, rect.height, window.innerHeight));
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(read);
    };
    const listen = (on: boolean) => {
      if (on === listening) return;
      listening = on;
      const method = on ? "addEventListener" : "removeEventListener";
      window[method]("scroll", schedule, { passive: true } as AddEventListenerOptions);
      window[method]("resize", schedule);
    };

    const io = new IntersectionObserver(([entry]) => {
      listen(entry.isIntersecting);
      schedule();
    });
    io.observe(el);

    return () => {
      io.disconnect();
      listen(false);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [ref]);

  return progress;
}

/**
 * True once `threshold` of the element has been on screen. Latches:
 * an arrival plays once and stays played, so scrolling back up never
 * un-does it (and reduced motion callers can just ignore it).
 */
export function useInView(ref: RefObject<HTMLElement | null>, threshold = 0.4): boolean {
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || inView) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          io.disconnect();
        }
      },
      { threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, threshold, inView]);

  return inView;
}
```

- [ ] **Step 6: Lint and typecheck**

Run: `pnpm lint && pnpm typecheck`
Expected: clean. (`react-hooks/set-state-in-effect` is satisfied: every `setProgress` / `setInView` runs inside an observer or rAF callback, never in the effect body.)

- [ ] **Step 7: Checkpoint**

Ready to commit as `feat(hooks): scroll progress through a pinned section, in-view latch, reduced-motion read`.

---

### Task 3: Lift `Podium` and `RankStrip` to `ui/`; extract `TileGrid`

**Files:**
- Move: `src/components/Leaderboard/Podium.tsx` → `src/components/ui/Podium/Podium.tsx`; `PodiumSkeleton.tsx` → `src/components/ui/Podium/PodiumSkeleton.tsx`; `podium.module.scss` → `src/components/ui/Podium/podium.module.scss`
- Move: `src/components/SendsGrid/RankStrip.tsx` → `src/components/ui/RankStrip/RankStrip.tsx`; `rankStrip.module.scss` → `src/components/ui/RankStrip/rankStrip.module.scss`
- Modify: `src/components/Leaderboard/LeaderboardView.tsx:9-10`, `src/components/Leaderboard/LeaderboardSkeleton.tsx:4`, `src/components/SendsGrid/GymScreen.tsx` (RankStrip import)
- Create: `src/components/ui/TileGrid/TileGrid.tsx`, `src/components/ui/TileGrid/tileGrid.module.scss`
- Modify: `src/components/SendsGrid/SendsGrid.tsx:147`, `src/components/SendsGrid/sendsGrid.module.scss:10-18`
- Modify: `src/components/ui/index.ts`

**Interfaces:**
- Produces: `import { Podium } from "@/components/ui/Podium/Podium"`, `import { RankStrip } from "@/components/ui/RankStrip/RankStrip"`, `import { TileGrid } from "@/components/ui"`:
  ```ts
  function TileGrid({ children, className }: { children: ReactNode; className?: string }): JSX.Element
  ```
  Signatures of `Podium` (`{ top, currentUserId, onPress, activeUserId? }`) and `RankStrip` (`{ rank: MyRank, gained: number | null }`) are unchanged.

- [ ] **Step 1: Move the files with git so history follows**

```bash
mkdir -p src/components/ui/Podium src/components/ui/RankStrip src/components/ui/TileGrid
git mv src/components/Leaderboard/Podium.tsx src/components/ui/Podium/Podium.tsx
git mv src/components/Leaderboard/PodiumSkeleton.tsx src/components/ui/Podium/PodiumSkeleton.tsx
git mv src/components/Leaderboard/podium.module.scss src/components/ui/Podium/podium.module.scss
git mv src/components/SendsGrid/RankStrip.tsx src/components/ui/RankStrip/RankStrip.tsx
git mv src/components/SendsGrid/rankStrip.module.scss src/components/ui/RankStrip/rankStrip.module.scss
```

- [ ] **Step 2: Fix the imports inside the moved files**

In `src/components/ui/Podium/Podium.tsx` change `import { UserAvatar, Username } from "@/components/ui";` to `import { UserAvatar } from "../UserAvatar"; import { Username } from "../Username";` (a `ui/` file importing the barrel it is exported from is a cycle waiting to happen — `LeaderboardRow` already does it this way).

In `src/components/ui/Podium/PodiumSkeleton.tsx` change `import { shimmerStyles } from "@/components/ui";` to `import { shimmerStyles } from "../Shimmer";` and `import { AVATAR_SIZES } from "@/components/ui/avatar-sizes";` to `import { AVATAR_SIZES } from "../avatar-sizes";`. (Check `Shimmer.tsx` exports `shimmerStyles`; if the barrel builds it another way, mirror that.)

`RankStrip.tsx` imports nothing from `ui/`; leave it. Its `import type { MyRank } from "@/app/(app)/rank-actions"` is a type-only import and stays.

- [ ] **Step 3: Fix the consumers**

`src/components/Leaderboard/LeaderboardView.tsx`:
```ts
import { Podium } from "@/components/ui/Podium/Podium";
import { PodiumSkeleton } from "@/components/ui/Podium/PodiumSkeleton";
```
`src/components/Leaderboard/LeaderboardSkeleton.tsx`:
```ts
import { PodiumSkeleton } from "@/components/ui/Podium/PodiumSkeleton";
```
`src/components/SendsGrid/GymScreen.tsx`:
```ts
import { RankStrip } from "@/components/ui/RankStrip/RankStrip";
```

- [ ] **Step 4: Create `TileGrid`**

`src/components/ui/TileGrid/tileGrid.module.scss`:
```scss
// ── Route tile grid ────────────────────────────────
// 4 columns — the tiles need to be big enough to tap cleanly with a
// thumb and show their number + grade overlay. 5 columns made each
// tile too narrow on phones. One rule for the wall, a game and the
// marketing device, so the grid is the same grid everywhere.
.grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--space-2);
}
```

`src/components/ui/TileGrid/TileGrid.tsx`:
```tsx
import type { ReactNode } from "react";
import styles from "./tileGrid.module.scss";

interface Props {
  children: ReactNode;
  className?: string;
}

/** The four-column grid every set of `SendGridTile`s sits in. */
export function TileGrid({ children, className }: Props) {
  return <div className={[styles.grid, className].filter(Boolean).join(" ")}>{children}</div>;
}
```

Add to `src/components/ui/index.ts` beside the `Legend` export:
```ts
export { TileGrid } from "./TileGrid/TileGrid";
```

- [ ] **Step 5: `SendsGrid` adopts it**

In `src/components/SendsGrid/SendsGrid.tsx` add `TileGrid` to the `@/components/ui` import (`import { Legend, TileGrid } from "@/components/ui";`) and replace
```tsx
        <div className={styles.tileGrid}>
          {routes.map((route) => {
```
… `</div>` with
```tsx
        <TileGrid>
          {routes.map((route) => {
```
… `</TileGrid>`.

Delete the `.tileGrid` rule (and its comment) from `src/components/SendsGrid/sendsGrid.module.scss`. Leave `tileIn` / `.tileEntrance` / `.rankStrip` alone.

- [ ] **Step 6: Verify nothing else referenced the old paths, then run the full check**

Run: `grep -rn "Leaderboard/Podium\|SendsGrid/RankStrip\|styles.tileGrid" src; pnpm check`
Expected: grep prints nothing; `pnpm check` clean (`skeletons.test.ts` still finds `PodiumSkeleton` beside `Podium`, now in `ui/Podium/`).

- [ ] **Step 7: Checkpoint**

Ready to commit as `refactor(ui): Podium, RankStrip and the tile grid are primitives — the marketing page shows the real ones`.

---

### Task 4: Copy and fixtures, with their rules pinned

**Files:**
- Create: `src/components/landing/copy.ts`, `src/components/landing/copy.test.ts`
- Create: `src/components/landing/fixtures.ts`, `src/components/landing/fixtures.test.ts`

**Interfaces:**
- Produces (copy): `HERO`, `LOG`, `LADDER`, `BOARD`, `ANYWHERE`, `QUIET`, `MADE_BY`, `CLOSE` — shapes below.
- Produces (fixtures): `YOU`, `SET`, `ROUTES`, `YOUR_LOGS`, `YOUR_RANK`, `CLIMBERS`, `GAME` — shapes below. Everything typed against `@/lib/data` so a migration that adds a column breaks the build here.

- [ ] **Step 1: Write the copy**

`src/components/landing/copy.ts`:

```ts
/**
 * Every string on the marketing page, in the order the page says them.
 *
 * Headings are plain statements of what the section is about, in
 * words a stranger already owns — nothing coined, nothing that only
 * makes sense after the body. `copy.test.ts` pins the standing rules:
 * "game" or "competition", never "match"; "free to join", never a
 * permanence promise; "leaderboard", never "Chorkboard".
 */

export const HERO = {
  headline: "Log your sends. Compete with your mates.",
  body:
    "Chork turns every route you climb into points and puts you on a leaderboard with your friends — at your gym, or anywhere you climb. Free to join, nothing to install.",
  cta: "Join for free",
} as const;

export const LOG = {
  headline: "Log a send in two taps.",
  body: "Tap the route you climbed and how many goes it took. That's it.",
  deviceLabel: "Your card: tapping route 8 opens its log sheet, two attempts are added, and the tile turns green when it's sent.",
} as const;

export const LADDER = {
  headline: "Fewer goes, more points.",
  body: "A flash is worth 4. Every extra go costs a point. Reach the zone and you still score.",
  rows: [
    { label: "First go", points: "4 pts", tile: { number: 4, state: "flash" } },
    { label: "Second go", points: "3 pts", tile: { number: 3, state: "completed" } },
    { label: "Third go", points: "2 pts", tile: { number: 2, state: "completed" } },
    { label: "Four or more", points: "1 pt", tile: { number: 1, state: "completed" } },
    { label: "Reaching the zone, finished or not", points: "+1 pt", tile: { number: 1, state: "attempted", zone: true } },
  ],
} as const;

export const BOARD = {
  headline: "See where you stand.",
  body: "Everyone climbing the same set shares one leaderboard. Log a send and it updates straight away.",
  deviceLabel: "The leaderboard: as you scroll, your row climbs from fifth to third and you join the podium.",
} as const;

export const ANYWHERE = {
  headline: "Run your own competition, anywhere.",
  body: "Pick the routes, share a link, and Chork keeps score. Gym, crag or home wall — your gym doesn't need to be on Chork.",
  deviceLabel: "A game between six friends on a home wall: six routes, a shared board, and a send that takes you to first place.",
} as const;

export const QUIET = {
  headline: "Also worth knowing",
  items: [
    { title: "Attempts are private.", body: "Points and flashes are public; how many goes it took is yours." },
    { title: "Beta stays hidden.", body: "Someone's hint stays covered until you've sent the route yourself." },
    { title: "Works offline.", body: "Log it in the basement; it catches up later." },
    { title: "No app store.", body: "Runs in your browser and installs to your home screen." },
  ],
} as const;

export const MADE_BY = {
  headline: "Built by a climber.",
  body: "Chork is made by one person who got tired of keeping score on the back of a hand. It's early, and it gets better every week.",
  contact: "hello@chork.app",
  contactNote: "reaches me directly.",
} as const;

export const CLOSE = {
  headline: "Join Chork for free.",
  cta: "Join for free",
  aside: "Climb somewhere that isn't on Chork yet? Tell them about it.",
} as const;
```

- [ ] **Step 2: Pin the copy rules**

`src/components/landing/copy.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import * as copy from "./copy";

/** Every string reachable from the copy module, flattened. */
function strings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => strings(v, out));
  else if (value && typeof value === "object") Object.values(value).forEach((v) => strings(v, out));
  return out;
}

const ALL = strings(copy);

describe("marketing copy", () => {
  it("has something to check", () => {
    expect(ALL.length).toBeGreaterThan(20);
  });

  it('says "game" or "competition", never "match"', () => {
    expect(ALL.filter((s) => /\bmatch(es)?\b/i.test(s))).toEqual([]);
  });

  it("makes no permanence promise about the price", () => {
    expect(ALL.filter((s) => /forever|always free|for life|free for good/i.test(s))).toEqual([]);
  });

  it('says "leaderboard", never "Chorkboard"', () => {
    expect(ALL.filter((s) => /chorkboard/i.test(s))).toEqual([]);
  });

  it("headlines are short plain statements — one line, no colon, no coined word", () => {
    const headlines = [
      copy.HERO.headline, copy.LOG.headline, copy.LADDER.headline, copy.BOARD.headline,
      copy.ANYWHERE.headline, copy.QUIET.headline, copy.MADE_BY.headline, copy.CLOSE.headline,
    ];
    for (const h of headlines) {
      expect(h.length, h).toBeLessThanOrEqual(48);
      expect(h, h).not.toMatch(/[:;—]/);
    }
  });
});
```

- [ ] **Step 3: Run to verify it passes (copy is data; the test exists to catch a future edit)**

Run: `pnpm test --run src/components/landing/copy.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 4: Write the fixtures**

`src/components/landing/fixtures.ts`:

```ts
import type { LeaderboardEntry, Route, RouteLog, RouteSet } from "@/lib/data";
import type { MyRank } from "@/app/(app)/rank-actions";
import { mockRoute, mockRouteLog, mockRouteSet } from "@/test/mocks";

/**
 * The people and the wall the marketing devices show.
 *
 * Built from the test mock factories rather than literals so a
 * migration that adds a column breaks the build here too, and so
 * the devices are typed against exactly what the app renders.
 *
 * Attempt privacy holds in fixtures as it does in data: only `YOU`
 * has logs. Every other climber is a board entry — points, flashes,
 * sends, zones — and never an attempt count. `fixtures.test.ts`
 * pins that. No real gym, brand or person appears.
 */

const AVATAR = ""; // the app's outlined glyph on the accent surface

export const YOU = { id: "you", username: "alex", name: "Alex", avatar_url: AVATAR } as const;

export const SET: RouteSet = mockRouteSet({
  id: "set_landing",
  gym_id: "gym_landing",
  name: "Autumn set",
});

const ZONE_ROUTES = new Set([3, 7, 11]);

export const ROUTES: Route[] = Array.from({ length: 12 }, (_, i) =>
  mockRoute({
    id: `route_${i + 1}`,
    set_id: SET.id,
    number: i + 1,
    has_zone: ZONE_ROUTES.has(i + 1),
    community_grade: [2, 3, 3, 4, 2, 5, 4, 3, 6, 4, 5, 6][i],
  }),
);

function log(routeNumber: number, attempts: number, completed: boolean, zone = false): RouteLog {
  return mockRouteLog({
    id: `log_${routeNumber}`,
    user_id: YOU.id,
    route_id: `route_${routeNumber}`,
    set_id: SET.id,
    gym_id: SET.gym_id,
    attempts,
    completed,
    zone,
  });
}

/** Your card as the hero shows it: two flashes, three sends, two in progress, route 8 untouched. */
export const YOUR_LOGS: RouteLog[] = [
  log(1, 1, true),
  log(2, 2, true),
  log(3, 3, true, true),
  log(4, 2, false),
  log(5, 1, true),
  log(7, 2, true, true),
  log(9, 1, false),
];

/** The route the "log a send" sequence taps. Untouched in YOUR_LOGS. */
export const TAPPED_ROUTE = 8;

/**
 * 18 points: two flashes (4 + 4), a send in two (3), a send in three
 * with the zone (2 + 1), a send in two with the zone (3 + 1). Fifth
 * of 23, three points off fourth. `fixtures.test.ts` adds it up.
 */
export const YOUR_RANK: MyRank = {
  rank: 5,
  points: 18,
  flashes: 2,
  climberCount: 23,
  toNext: { rank: 4, points: 3 },
};

function climber(
  rank: number,
  username: string,
  name: string,
  points: number,
  flashes: number,
  sends: number,
  zones: number,
): LeaderboardEntry {
  return { user_id: `user_${username}`, username, name, avatar_url: AVATAR, rank, points, flashes, sends, zones };
}

/** The board above and around you, rank order. `YOU` is fifth. */
export const CLIMBERS: LeaderboardEntry[] = [
  climber(1, "priya_k", "Priya", 40, 6, 12, 3),
  climber(2, "sam.sends", "Sam", 34, 5, 10, 2),
  climber(3, "marcus", "Marcus", 27, 3, 8, 2),
  climber(4, "dev_t", "Dev", 20, 2, 6, 1),
  { user_id: YOU.id, username: YOU.username, name: YOU.name, avatar_url: AVATAR, rank: 5, points: 18, flashes: 2, sends: 5, zones: 2 },
];

/** A game between six friends on a home wall. */
export const GAME = {
  name: "Tuesday six",
  location: "Ben's garage",
  players: [
    YOU,
    { id: "user_priya_k", username: "priya_k", name: "Priya", avatar_url: AVATAR },
    { id: "user_sam.sends", username: "sam.sends", name: "Sam", avatar_url: AVATAR },
    { id: "user_marcus", username: "marcus", name: "Marcus", avatar_url: AVATAR },
    { id: "user_dev_t", username: "dev_t", name: "Dev", avatar_url: AVATAR },
    { id: "guest_jo", username: null, name: "Jo", avatar_url: AVATAR },
  ],
  /** Six routes, V-grades as the host declared them. */
  routes: [
    { number: 1, grade: "V2" },
    { number: 2, grade: "V3" },
    { number: 3, grade: "V3" },
    { number: 4, grade: "V4" },
    { number: 5, grade: "V4" },
    { number: 6, grade: "V5" },
  ],
  /** Your logs in the game before the send that wins it. Route 5 is the one. */
  yourLogs: [
    { number: 1, attempts: 1, completed: true },
    { number: 2, attempts: 2, completed: true },
    { number: 3, attempts: 1, completed: true },
    { number: 4, attempts: 3, completed: true },
  ],
  /** Top three before your send. */
  board: [
    { userId: "user_priya_k", username: "priya_k", name: "Priya", points: 16, flashes: 3 },
    { userId: YOU.id, username: YOU.username, name: YOU.name, points: 13, flashes: 2 },
    { userId: "user_sam.sends", username: "sam.sends", name: "Sam", points: 11, flashes: 2 },
  ],
} as const;
```

- [ ] **Step 5: Pin attempt privacy over the fixtures**

`src/components/landing/fixtures.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computePoints } from "@/lib/data";
import { CLIMBERS, GAME, ROUTES, SET, TAPPED_ROUTE, YOU, YOUR_LOGS, YOUR_RANK } from "./fixtures";

describe("marketing fixtures", () => {
  it("only you have logs — nobody else's attempt count exists to leak", () => {
    for (const l of YOUR_LOGS) expect(l.user_id).toBe(YOU.id);
    for (const l of GAME.yourLogs) expect(l).not.toHaveProperty("user_id");
  });

  it("board entries carry points and flashes, never attempts", () => {
    for (const c of CLIMBERS) expect(c).not.toHaveProperty("attempts");
    for (const r of GAME.board) expect(r).not.toHaveProperty("attempts");
  });

  it("your card adds up to the rank strip's points and flashes", () => {
    const points = YOUR_LOGS.reduce((n, l) => n + computePoints(l), 0);
    const flashes = YOUR_LOGS.filter((l) => l.attempts === 1 && l.completed).length;
    expect(points).toBe(YOUR_RANK.points);
    expect(flashes).toBe(YOUR_RANK.flashes);
    expect(CLIMBERS.find((c) => c.user_id === YOU.id)?.points).toBe(YOUR_RANK.points);
  });

  it("the tapped route exists, belongs to the set and is untouched", () => {
    expect(ROUTES.some((r) => r.number === TAPPED_ROUTE && r.set_id === SET.id)).toBe(true);
    expect(YOUR_LOGS.some((l) => l.route_id === `route_${TAPPED_ROUTE}`)).toBe(false);
  });

  it("the board is in rank order and you are on it", () => {
    CLIMBERS.forEach((c, i) => expect(c.rank).toBe(i + 1));
    expect(CLIMBERS.at(-1)?.user_id).toBe(YOU.id);
  });

  it("names no real gym", () => {
    const text = JSON.stringify({ SET, GAME });
    expect(text).not.toMatch(/depot|yonder|climbing works|arch|castle|biscuit|boulder(ing)? (hut|shed|central)/i);
  });
});
```

- [ ] **Step 6: Run both**

Run: `pnpm test --run src/components/landing && pnpm typecheck && pnpm typecheck:test`
Expected: PASS (11 tests); typecheck clean. The arithmetic is checked, not assumed: 18 points from the logs, fourth place at 20 is 3 points away (20 − 18 + 1), and the gaps above — 20, 27, 34, 40 — are what Task 5's step sizes are built on.

- [ ] **Step 7: Checkpoint**

Ready to commit as `feat(landing): the page's copy and its fixtures, with the copy rules and attempt privacy pinned`.

---

### Task 5: Screen state functions — what each device shows at each step

**Files:**
- Create: `src/components/landing/screens/cardScreen.ts`, `cardScreen.test.ts`
- Create: `src/components/landing/screens/boardScreen.ts`, `boardScreen.test.ts`
- Create: `src/components/landing/screens/gameScreen.ts`, `gameScreen.test.ts`

**Interfaces:**
- Consumes: fixtures from Task 4; `deriveTileState`, `computePoints`, `isFlash` from `@/lib/data`; `LeaderboardRowData` from `@/components/ui`.
- Produces:
  ```ts
  // cardScreen.ts
  export const CARD_STEPS = 5;
  export type SheetState = { attempts: number; completed: boolean } | null;
  export interface CardScreenState {
    logs: Map<string, RouteLog>;   // by route id, YOUR_LOGS plus the tapped route's log at this step
    sheet: SheetState;             // the in-device log sheet, null when closed
    rank: MyRank;
  }
  export function cardScreenAt(step: number): CardScreenState;

  // boardScreen.ts
  export const BOARD_STEPS = 3;
  export interface BoardScreenState { entries: LeaderboardEntry[]; }  // rank order
  export function boardScreenAt(step: number): BoardScreenState;

  // gameScreen.ts
  export const GAME_STEPS = 2;
  export interface GameScreenState {
    tiles: Array<{ number: number; state: TileState; gradeLabel: string }>;
    rows: LeaderboardRowData[];    // rank order, rank filled in
  }
  export function gameScreenAt(step: number): GameScreenState;
  ```

- [ ] **Step 1: Card screen — failing test**

`src/components/landing/screens/cardScreen.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { deriveTileState } from "@/lib/data";
import { TAPPED_ROUTE, YOUR_LOGS, YOUR_RANK } from "../fixtures";
import { CARD_STEPS, cardScreenAt } from "./cardScreen";

const tapped = `route_${TAPPED_ROUTE}`;

describe("cardScreenAt", () => {
  it("step 0 is your card as it stands: sheet closed, tapped route empty", () => {
    const s = cardScreenAt(0);
    expect(s.sheet).toBeNull();
    expect(deriveTileState(s.logs.get(tapped))).toBe("empty");
    expect(s.logs.size).toBe(YOUR_LOGS.length);
    expect(s.rank).toEqual(YOUR_RANK);
  });

  it("step 1 opens the sheet on the tapped route with one attempt", () => {
    const s = cardScreenAt(1);
    expect(s.sheet).toEqual({ attempts: 1, completed: false });
    expect(deriveTileState(s.logs.get(tapped))).toBe("attempted");
  });

  it("step 2 adds a second attempt", () => {
    expect(cardScreenAt(2).sheet).toEqual({ attempts: 2, completed: false });
  });

  it("step 3 marks it sent, sheet still open", () => {
    const s = cardScreenAt(3);
    expect(s.sheet).toEqual({ attempts: 2, completed: true });
    expect(deriveTileState(s.logs.get(tapped))).toBe("completed");
  });

  it("step 4 closes the sheet; the tile stays sent and the rank strip has moved", () => {
    const s = cardScreenAt(4);
    expect(s.sheet).toBeNull();
    expect(deriveTileState(s.logs.get(tapped))).toBe("completed");
    expect(s.rank.points).toBe(YOUR_RANK.points + 3);
    expect(s.rank.rank).toBe((YOUR_RANK.rank ?? 0) - 1);
  });

  it("the last step is the end state, and steps beyond it are the same", () => {
    expect(cardScreenAt(CARD_STEPS - 1)).toEqual(cardScreenAt(4));
    expect(cardScreenAt(99)).toEqual(cardScreenAt(4));
  });

  it("never touches any log but the tapped route's", () => {
    for (let step = 0; step < CARD_STEPS; step++) {
      const s = cardScreenAt(step);
      for (const l of YOUR_LOGS) expect(s.logs.get(l.route_id)).toEqual(l);
    }
  });
});
```

- [ ] **Step 2: Run it — expect module-not-found**

Run: `pnpm test --run src/components/landing/screens/cardScreen.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`src/components/landing/screens/cardScreen.ts`:

```ts
import type { RouteLog } from "@/lib/data";
import type { MyRank } from "@/app/(app)/rank-actions";
import { mockRouteLog } from "@/test/mocks";
import { SET, TAPPED_ROUTE, YOU, YOUR_LOGS, YOUR_RANK } from "../fixtures";

/**
 * "Log a send in two taps", as five states the reader scrolls through:
 *   0  the card as it stands
 *   1  route 8 tapped — sheet open, one attempt
 *   2  a second attempt
 *   3  marked as sent (a send in two goes: 3 points)
 *   4  sheet closed, tile green, rank strip up one place
 * A pure function of the step so every state is a unit test, and the
 * component that renders it decides nothing.
 */
export const CARD_STEPS = 5;

export type SheetState = { attempts: number; completed: boolean } | null;

export interface CardScreenState {
  logs: Map<string, RouteLog>;
  sheet: SheetState;
  rank: MyRank;
}

const TAPPED_ID = `route_${TAPPED_ROUTE}`;

const BASE = new Map(YOUR_LOGS.map((l) => [l.route_id, l]));

const SENT_POINTS = 3; // computePoints({ attempts: 2, completed: true, zone: false })

function tappedLog(attempts: number, completed: boolean): RouteLog {
  return mockRouteLog({
    id: "log_tapped",
    user_id: YOU.id,
    route_id: TAPPED_ID,
    set_id: SET.id,
    gym_id: SET.gym_id,
    attempts,
    completed,
  });
}

export function cardScreenAt(step: number): CardScreenState {
  const s = Math.max(0, Math.min(CARD_STEPS - 1, step));
  if (s === 0) return { logs: new Map(BASE), sheet: null, rank: YOUR_RANK };

  const attempts = s === 1 ? 1 : 2;
  const completed = s >= 3;
  const logs = new Map(BASE).set(TAPPED_ID, tappedLog(attempts, completed));

  if (s < 4) return { logs, sheet: { attempts, completed }, rank: YOUR_RANK };

  const rank: MyRank = {
    ...YOUR_RANK,
    rank: (YOUR_RANK.rank ?? 1) - 1,
    points: YOUR_RANK.points + SENT_POINTS,
    // 21 points now; third is at 27, so 7 to pass.
    toNext: { rank: (YOUR_RANK.rank ?? 1) - 2, points: 7 },
  };
  return { logs, sheet: null, rank };
}
```

- [ ] **Step 4: Run — expect PASS (7 tests)**

Run: `pnpm test --run src/components/landing/screens/cardScreen.test.ts`

- [ ] **Step 5: Board screen — failing test**

`src/components/landing/screens/boardScreen.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { CLIMBERS, YOU } from "../fixtures";
import { BOARD_STEPS, boardScreenAt } from "./boardScreen";

const yourRank = (step: number) => boardScreenAt(step).entries.find((e) => e.user_id === YOU.id)?.rank;

describe("boardScreenAt", () => {
  it("step 0 is the board as it stands", () => {
    expect(boardScreenAt(0).entries).toEqual(CLIMBERS);
  });

  it("you climb one place per step: fifth, fourth, third", () => {
    expect(yourRank(0)).toBe(5);
    expect(yourRank(1)).toBe(4);
    expect(yourRank(2)).toBe(3);
  });

  it("every step is a whole board in rank order with dense ranks", () => {
    for (let step = 0; step < BOARD_STEPS; step++) {
      const { entries } = boardScreenAt(step);
      expect(entries).toHaveLength(CLIMBERS.length);
      entries.forEach((e, i) => expect(e.rank).toBe(i + 1));
      for (let i = 1; i < entries.length; i++) {
        expect(entries[i - 1].points).toBeGreaterThan(entries[i].points);
      }
    }
  });

  it("only your points change — everyone else keeps theirs", () => {
    for (let step = 0; step < BOARD_STEPS; step++) {
      for (const c of CLIMBERS) {
        if (c.user_id === YOU.id) continue;
        const now = boardScreenAt(step).entries.find((e) => e.user_id === c.user_id);
        expect(now?.points).toBe(c.points);
        expect(now?.flashes).toBe(c.flashes);
      }
    }
  });

  it("nobody on the board carries an attempt count", () => {
    for (const e of boardScreenAt(BOARD_STEPS - 1).entries) expect(e).not.toHaveProperty("attempts");
  });

  it("steps beyond the last are the end state", () => {
    expect(boardScreenAt(99)).toEqual(boardScreenAt(BOARD_STEPS - 1));
  });
});
```

- [ ] **Step 6: Implement**

`src/components/landing/screens/boardScreen.ts`:

```ts
import type { LeaderboardEntry } from "@/lib/data";
import { CLIMBERS, YOU } from "../fixtures";

/**
 * "See where you stand": you start fifth and climb a place per step.
 * Each step is a whole board, re-ranked — the component slides rows
 * into their new slots and never has to work out who moved.
 */
export const BOARD_STEPS = 3;

export interface BoardScreenState {
  entries: LeaderboardEntry[];
}

/**
 * The points that put you one above the climber currently in the
 * place above: a send with the zone (5) takes you from 18 past
 * fourth at 20, then a flash with the zone (5) past third at 27.
 */
const YOUR_POINTS_AT_STEP = (base: number) => [base, base + 5, base + 10];

export function boardScreenAt(step: number): BoardScreenState {
  const s = Math.max(0, Math.min(BOARD_STEPS - 1, step));
  const you = CLIMBERS.find((c) => c.user_id === YOU.id);
  if (!you) throw new Error("fixture: you are not on the board");

  const yours = YOUR_POINTS_AT_STEP(you.points)[s];
  const flashes = you.flashes + (s === 2 ? 1 : 0);
  const sends = you.sends + s;
  const zones = you.zones + s;

  const entries = CLIMBERS.map((c) =>
    c.user_id === YOU.id ? { ...c, points: yours, flashes, sends, zones } : c,
  )
    .sort((a, b) => b.points - a.points || b.flashes - a.flashes)
    .map((c, i) => ({ ...c, rank: i + 1 }));

  return { entries };
}
```

- [ ] **Step 7: Run — expect PASS (6 tests)**

Run: `pnpm test --run src/components/landing/screens/boardScreen.test.ts`

- [ ] **Step 8: Game screen — failing test**

`src/components/landing/screens/gameScreen.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { GAME, YOU } from "../fixtures";
import { GAME_STEPS, gameScreenAt } from "./gameScreen";

describe("gameScreenAt", () => {
  it("step 0: four sent, route 5 untouched, you second", () => {
    const s = gameScreenAt(0);
    expect(s.tiles.map((t) => t.state)).toEqual(["flash", "completed", "flash", "completed", "empty", "empty"]);
    expect(s.rows[1].userId).toBe(YOU.id);
    expect(s.rows[1].rank).toBe(2);
  });

  it("step 1: route 5 flashed and you take first", () => {
    const s = gameScreenAt(1);
    expect(s.tiles[4].state).toBe("flash");
    expect(s.rows[0].userId).toBe(YOU.id);
    expect(s.rows[0].rank).toBe(1);
    expect(s.rows[0].points).toBe(GAME.board[1].points + 4);
    expect(s.rows[0].flashes).toBe(GAME.board[1].flashes + 1);
  });

  it("grade labels ride the tiles", () => {
    expect(gameScreenAt(0).tiles.map((t) => t.gradeLabel)).toEqual(GAME.routes.map((r) => r.grade));
  });

  it("rows are dense-ranked in points order at every step", () => {
    for (let step = 0; step < GAME_STEPS; step++) {
      const { rows } = gameScreenAt(step);
      rows.forEach((r, i) => expect(r.rank).toBe(i + 1));
      for (let i = 1; i < rows.length; i++) expect(Number(rows[i - 1].points)).toBeGreaterThan(Number(rows[i].points));
    }
  });

  it("steps beyond the last are the end state", () => {
    expect(gameScreenAt(9)).toEqual(gameScreenAt(GAME_STEPS - 1));
  });
});
```

- [ ] **Step 9: Implement**

`src/components/landing/screens/gameScreen.ts`:

```ts
import type { TileState } from "@/lib/data";
import { deriveTileState } from "@/lib/data";
import type { LeaderboardRowData } from "@/components/ui";
import { GAME, YOU } from "../fixtures";

/**
 * "Run your own competition, anywhere": one state change on arrival.
 * Route 5 goes from untouched to flashed, and the four points take
 * you from second to first.
 */
export const GAME_STEPS = 2;

export interface GameScreenState {
  tiles: Array<{ number: number; state: TileState; gradeLabel: string }>;
  rows: LeaderboardRowData[];
}

const WINNING_ROUTE = 5;
const FLASH_POINTS = 4;

export function gameScreenAt(step: number): GameScreenState {
  const s = Math.max(0, Math.min(GAME_STEPS - 1, step));

  const tiles = GAME.routes.map((r) => {
    const log = GAME.yourLogs.find((l) => l.number === r.number) ?? null;
    const state: TileState =
      s === 1 && r.number === WINNING_ROUTE ? "flash" : deriveTileState(log);
    return { number: r.number, state, gradeLabel: r.grade };
  });

  const rows = GAME.board
    .map((r) =>
      r.userId === YOU.id && s === 1
        ? { ...r, points: r.points + FLASH_POINTS, flashes: r.flashes + 1 }
        : r,
    )
    .sort((a, b) => b.points - a.points || b.flashes - a.flashes)
    .map((r, i): LeaderboardRowData => ({
      userId: r.userId,
      username: r.username,
      name: r.name,
      avatarUrl: "",
      rank: i + 1,
      points: r.points,
      flashes: r.flashes,
    }));

  return { tiles, rows };
}
```

- [ ] **Step 10: Run every screen test and the type checks**

Run: `pnpm test --run src/components/landing && pnpm typecheck && pnpm typecheck:test`
Expected: PASS (all); typecheck clean.

- [ ] **Step 11: Checkpoint**

Ready to commit as `feat(landing): what each device shows at each scroll step, as pure functions with a test per step`.

---

### Task 6: The device and its three screens

**Files:**
- Create: `src/components/landing/DeviceFrame.tsx`, `deviceFrame.module.scss`
- Create: `src/components/landing/CardScreen.tsx`, `cardScreen.module.scss`
- Create: `src/components/landing/BoardRows.tsx`, `boardRows.module.scss`
- Create: `src/components/landing/BoardScreen.tsx`
- Create: `src/components/landing/GameScreen.tsx`, `gameScreen.module.scss`
- Create: `src/components/landing/Screens.stories.tsx`

**Interfaces:**
- Consumes: `cardScreenAt` / `boardScreenAt` / `gameScreenAt` (Task 5); `RankStrip`, `Podium`, `TileGrid` (Task 3); `SendGridTile`, `Legend`, `LeaderboardRow`, `LogSheetHeader`, `AttemptCounter`, `PointsPreview`, `CompletedRow`, `Button`, `UserAvatar` from `@/components/ui`.
- Produces:
  ```tsx
  <DeviceFrame label={string} className?>{children}</DeviceFrame>
  <CardScreen step={number} />
  <BoardScreen step={number} />
  <GameScreen step={number} />
  <BoardRows rows={LeaderboardRowData[]} youId={string} />   // rank order; slot = rank − 1
  ```

- [ ] **Step 1: `DeviceFrame`**

`src/components/landing/deviceFrame.module.scss`:

```scss
@use "mixins/breakpoints" as bp;

// A phone-shaped frame around real app UI. The bezel is the mono
// solid so it reads as hardware in both modes; the screen is the
// app's own page plane. No notch, no buttons — the point is the app,
// and the frame only has to say "this is on a phone".
.frame {
  --device-zoom: 1;
  box-sizing: border-box;
  width: 100%;
  max-width: calc(var(--content-narrow) + 2 * var(--space-3));
  margin: 0 auto;
  padding: var(--space-3);
  border-radius: var(--radius-5);
  background: var(--mono-solid);
  box-shadow: var(--shadow-xl);
  zoom: var(--device-zoom);

  @include bp.desktop {
    --device-zoom: 1.2;
  }
}

.screen {
  box-sizing: border-box;
  height: var(--size-device-h);
  max-height: 100%;
  overflow: hidden;
  position: relative;
  padding: var(--space-4) var(--space-3);
  border-radius: var(--radius-inner-5-3);
  background: var(--surface-page);
  color: var(--mono-text);
}
```

`src/components/landing/DeviceFrame.tsx`:

```tsx
import type { ReactNode } from "react";
import styles from "./deviceFrame.module.scss";

interface Props {
  /** What the picture shows, for anyone who can't see it. */
  label: string;
  children: ReactNode;
  className?: string;
}

/**
 * The marketing page's phone. Its child is ordinary app UI at the
 * width the app runs at on a small phone — real components with
 * fixture data, not a drawing of them.
 *
 * The screen is `inert`: the device is a picture of the app, and a
 * picture has no tab stops, no links and no buttons to press. The
 * frame is the image, and `label` is its alt text.
 */
export function DeviceFrame({ label, children, className }: Props) {
  return (
    <div className={[styles.frame, className].filter(Boolean).join(" ")} role="img" aria-label={label}>
      <div className={styles.screen} inert>
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: `CardScreen` with the in-device log sheet**

`src/components/landing/cardScreen.module.scss`:

```scss
@use "mixins/layout" as layout;
@use "mixins/surfaces" as surface;
@use "mixins/typography" as type;

.card {
  @include layout.stack(var(--space-4));
}

// The log sheet, as the app draws it, but inside the device: a glass
// panel rising from the screen's foot rather than the viewport's. It
// transitions on the same tokens as the real sheet, and reduced
// motion shows it in place.
.sheet {
  @include surface.glass(90%);
  @include layout.stack(var(--space-4));
  position: absolute;
  inset: auto 0 0 0;
  padding: var(--space-4) var(--space-4) var(--space-6);
  border-radius: var(--radius-3) var(--radius-3) 0 0;
  transform: translateY(100%);
  transition: transform var(--duration-normal) var(--ease-out);

  &[data-open="true"] {
    transform: translateY(0);
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
}

.sheetTitle {
  @include type.typography(card-title);
  color: var(--mono-text);
}
```

`src/components/landing/CardScreen.tsx`:

```tsx
"use client";

import { computePoints, deriveTileState, isFlash } from "@/lib/data";
import {
  AttemptCounter,
  Button,
  CompletedRow,
  Legend,
  LogSheetHeader,
  PointsPreview,
  TileGrid,
} from "@/components/ui";
import { SendGridTile } from "@/components/ui/SendGridTile/SendGridTile";
import { RankStrip } from "@/components/ui/RankStrip/RankStrip";
import { formatGrade } from "@/lib/data/grade-label";
import { ROUTES, TAPPED_ROUTE } from "./fixtures";
import { cardScreenAt } from "./screens/cardScreen";
import styles from "./cardScreen.module.scss";

interface Props {
  step: number;
}

const noop = () => {};

/**
 * Your card, on the device: the rank strip, the legend and the send
 * grid — the app's own components with the fixture's logs — plus the
 * log sheet for the tapped route when the step has it open.
 */
export function CardScreen({ step }: Props) {
  const { logs, sheet, rank } = cardScreenAt(step);
  const tapped = ROUTES.find((r) => r.number === TAPPED_ROUTE);
  const grade = tapped?.community_grade != null ? formatGrade(tapped.community_grade, "v") : null;

  return (
    <div className={styles.card}>
      <RankStrip rank={rank} gained={null} />
      <Legend />
      <TileGrid>
        {ROUTES.map((route) => {
          const log = logs.get(route.id);
          return (
            <SendGridTile
              key={route.id}
              number={route.number}
              state={deriveTileState(log)}
              zone={log?.zone}
              onClick={noop}
            />
          );
        })}
      </TileGrid>

      {tapped && (
        <div className={styles.sheet} data-open={sheet !== null}>
          <LogSheetHeader
            number={tapped.number}
            showFlash={sheet ? isFlash({ attempts: sheet.attempts, completed: sheet.completed }) : false}
            subline={grade ? `${grade} · Community grade` : "Ungraded"}
          />
          <AttemptCounter attempts={sheet?.attempts ?? 0} onChange={noop} hideControls={sheet?.completed} />
          <PointsPreview
            attempts={sheet?.attempts ?? 0}
            completed={sheet?.completed ?? false}
            earned={sheet ? computePoints({ attempts: sheet.attempts, completed: sheet.completed, zone: false }) : 0}
            preview={sheet ? computePoints({ attempts: sheet.attempts, completed: true, zone: false }) : 0}
            zone={false}
          />
          {sheet?.completed ? (
            <CompletedRow isFlash={false} onUndo={noop} />
          ) : (
            <Button fullWidth onClick={noop}>Mark as sent</Button>
          )}
        </div>
      )}
    </div>
  );
}
```

Check the real `RouteLogSheet` for the exact button label ("Mark as complete" vs "Mark as sent") and use the app's string. `SendGridTile` gets an `onClick` so it renders as the app's button (the hover/press affordance is the real one; `inert` on the screen means it can't actually be pressed).

- [ ] **Step 3: `BoardRows` — rows in slots so a row can slide**

`src/components/landing/boardRows.module.scss`:

```scss
// A list where every row sits in a slot one row tall and slides to a
// new slot when its rank changes. Absolute rows on a fixed-height
// list: the only way a reorder is a transition rather than a jump
// without a layout-animation library.
.rows {
  position: relative;
  list-style: none;
  margin: 0;
  padding: 0;
  height: calc(var(--row-count) * var(--size-board-row));
}

.row {
  position: absolute;
  inset: 0 0 auto 0;
  height: var(--size-board-row);
  transform: translateY(calc(var(--slot) * var(--size-board-row)));
  transition: transform var(--duration-normal) var(--ease-out);

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
}
```

`src/components/landing/BoardRows.tsx`:

```tsx
"use client";

import type { CSSProperties } from "react";
import { LeaderboardRow, type LeaderboardRowData } from "@/components/ui";
import styles from "./boardRows.module.scss";

interface Props {
  /** Rank order. A row's slot is its rank − 1. */
  rows: LeaderboardRowData[];
  youId: string;
}

/**
 * Leaderboard rows that slide when the order changes. Rendered in a
 * stable order (by climber, not by rank) so React keeps each row's
 * element and the CSS transition on `--slot` does the moving.
 */
export function BoardRows({ rows, youId }: Props) {
  const stable = [...rows].sort((a, b) => a.userId.localeCompare(b.userId));
  return (
    <ul className={styles.rows} style={{ "--row-count": rows.length } as CSSProperties} aria-label="Leaderboard">
      {stable.map((row) => (
        <li
          key={row.userId}
          className={styles.row}
          style={{ "--slot": (row.rank ?? 1) - 1 } as CSSProperties}
        >
          <LeaderboardRow entry={row} highlighted={row.userId === youId} interactive={false} />
        </li>
      ))}
    </ul>
  );
}
```

Check `LeaderboardRow`'s remaining props (lines 80+ of `LeaderboardRow.tsx`): if `interactive={false}` without `onPress` is not a supported combination, pass `onPress={undefined}` and `interactive={false}` as the app's own-row call sites do.

- [ ] **Step 4: `BoardScreen`**

`src/components/landing/BoardScreen.tsx`:

```tsx
"use client";

import { toLeaderboardRowData } from "@/components/ui";
import { Podium } from "@/components/ui/Podium/Podium";
import { YOU } from "./fixtures";
import { boardScreenAt } from "./screens/boardScreen";
import { BoardRows } from "./BoardRows";

interface Props {
  step: number;
}

const noop = () => {};

/**
 * The leaderboard on the device: the podium and the rows beneath,
 * the app's own. The podium is keyed on who is on it so a change
 * of top three replays its build-out; the rows slide.
 */
export function BoardScreen({ step }: Props) {
  const { entries } = boardScreenAt(step);
  const top = entries.slice(0, 3);
  return (
    <>
      <Podium key={top.map((e) => e.user_id).join("|")} top={top} currentUserId={YOU.id} onPress={noop} />
      <BoardRows rows={entries.map(toLeaderboardRowData)} youId={YOU.id} />
    </>
  );
}
```

If the podium's entrance keyframes look wrong replaying on the key change, wrap it in a `div` with the key instead; the intent is a fresh build-out when the top three changes.

- [ ] **Step 5: `GameScreen`**

`src/components/landing/gameScreen.module.scss`:

```scss
@use "mixins/layout" as layout;
@use "mixins/typography" as type;

.game {
  @include layout.stack(var(--space-4));
}

.title {
  @include type.typography(display, $step: 2xl);
  color: var(--mono-text);
}

.players {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.stack {
  display: inline-flex;

  > * + * {
    margin-left: calc(var(--space-2) * -1);
  }
}

.playersCount {
  @include type.typography(meta);
  color: var(--mono-text-low-contrast);
}
```

`src/components/landing/GameScreen.tsx`:

```tsx
"use client";

import { TileGrid, UserAvatar } from "@/components/ui";
import { SendGridTile } from "@/components/ui/SendGridTile/SendGridTile";
import { countOf } from "@/lib/plural";
import { GAME, YOU } from "./fixtures";
import { gameScreenAt } from "./screens/gameScreen";
import { BoardRows } from "./BoardRows";
import styles from "./gameScreen.module.scss";

interface Props {
  step: number;
}

const noop = () => {};

/** A game on the device: who's in, the routes, and the board. */
export function GameScreen({ step }: Props) {
  const { tiles, rows } = gameScreenAt(step);
  return (
    <div className={styles.game}>
      <header>
        <h2 className={styles.title}>{GAME.name}</h2>
        <div className={styles.players}>
          <span className={styles.stack} aria-hidden>
            {GAME.players.slice(0, 4).map((p) => (
              <UserAvatar key={p.id} user={{ id: p.id, username: p.username, name: p.name, avatar_url: p.avatar_url }} size="stack" />
            ))}
          </span>
          <span className={styles.playersCount}>
            {countOf(GAME.players.length, "player")} · {GAME.location}
          </span>
        </div>
      </header>
      <TileGrid>
        {tiles.map((t) => (
          <SendGridTile key={t.number} number={t.number} state={t.state} gradeLabel={t.gradeLabel} onClick={noop} />
        ))}
      </TileGrid>
      <BoardRows rows={rows} youId={YOU.id} />
    </div>
  );
}
```

`UserAvatar`'s `user` is `Pick<Profile, "id" | "avatar_url" | "name" | "username">`; a guest has `username: null`, which `Profile.username` may not allow — if typecheck complains, give the guest a `username` of `""` in `GAME.players` and note it on the fixture.

- [ ] **Step 6: Stories for all three screens at every step**

`src/components/landing/Screens.stories.tsx`:

```tsx
import type { Meta, StoryObj } from "@storybook/nextjs";
import { DeviceFrame } from "./DeviceFrame";
import { CardScreen } from "./CardScreen";
import { BoardScreen } from "./BoardScreen";
import { GameScreen } from "./GameScreen";
import { CARD_STEPS } from "./screens/cardScreen";
import { BOARD_STEPS } from "./screens/boardScreen";
import { GAME_STEPS } from "./screens/gameScreen";

const meta = {
  title: "Landing/Device screens",
  parameters: { layout: "centered" },
} satisfies Meta;

export default meta;

const steps = (n: number) => Array.from({ length: n }, (_, i) => i);

export const Card: StoryObj = {
  render: () => (
    <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
      {steps(CARD_STEPS).map((s) => (
        <DeviceFrame key={s} label={`Card, step ${s}`}><CardScreen step={s} /></DeviceFrame>
      ))}
    </div>
  ),
};

export const Board: StoryObj = {
  render: () => (
    <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
      {steps(BOARD_STEPS).map((s) => (
        <DeviceFrame key={s} label={`Board, step ${s}`}><BoardScreen step={s} /></DeviceFrame>
      ))}
    </div>
  ),
};

export const Game: StoryObj = {
  render: () => (
    <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
      {steps(GAME_STEPS).map((s) => (
        <DeviceFrame key={s} label={`Game, step ${s}`}><GameScreen step={s} /></DeviceFrame>
      ))}
    </div>
  ),
};
```

(Stories are exempt from the inline-style rule.)

- [ ] **Step 7: Compile the stylesheets, then typecheck and lint**

Run:
```bash
for f in src/components/landing/{deviceFrame,cardScreen,boardRows,gameScreen}.module.scss; do npx sass --load-path=src/styles --no-source-map "$f" > /dev/null || echo "FAIL $f"; done
pnpm typecheck && pnpm lint && pnpm test --run src/styles
```
Expected: no `FAIL`; typecheck, lint and the design-system tests clean. (The landing folder is still under the `MARKETING` size waiver until Task 9, but nothing here needs it — if the design-system tests flag something in these four files, fix it now.)

- [ ] **Step 8: Look at them**

Run: `pnpm storybook` and open *Landing / Device screens*. Check: the card's tiles are the app's tiles; the sheet rises inside the screen and never escapes it; rows slide between steps 0→1→2 of Board (click between stories to compare); the podium shows you at step 2; the game's route 5 is amber at step 1. Both themes via the toolbar toggle.

- [ ] **Step 9: Checkpoint**

Ready to commit as `feat(landing): the device, and the card, board and game on it — the app's own components with fixture data`.

---

### Task 7: Section primitives — copy, pinned, arrival

**Files:**
- Create: `src/components/landing/Section.tsx`, `src/components/landing/section.module.scss`

**Interfaces:**
- Consumes: `useScrollProgress`, `useInView`, `useReducedMotion` (Task 2); `stepAt` (Task 2); `DeviceFrame` (Task 6).
- Produces:
  ```tsx
  <SectionCopy headline={string} body={string} as?="h2" />
  <PinnedSection headline body steps={number} deviceLabel={string}>{(step) => ReactNode}</PinnedSection>
  <ArrivalSection headline body deviceLabel={string}>{(step: 0 | 1) => ReactNode}</ArrivalSection>
  ```

- [ ] **Step 1: Styles**

`src/components/landing/section.module.scss`:

```scss
@use "mixins/typography" as type;
@use "mixins/layout" as layout;
@use "mixins/breakpoints" as bp;

// ── Copy ───────────────────────────────────────────
// One claim: a headline and a sentence or two, centred, on a measure
// that never runs past 60 characters. Weight and colour do the
// hierarchy; the body is step 12 on the page plane (step 11 is only
// AA on a card).
.copy {
  @include layout.stack(var(--space-4));
  align-items: center;
  text-align: center;
  max-width: var(--content-prose);
  margin: 0 auto;
}

.headline {
  @include type.typography(display, $step: 3xl);
  color: var(--mono-text);
  text-wrap: balance;

  @include bp.tablet {
    @include type.typography(display, $step: 5xl);
  }
}

.body {
  @include type.typography(body, $step: lg);
  color: var(--mono-text);
  max-width: 36rem;
  text-wrap: pretty;

  @include bp.tablet {
    @include type.typography(body, $step: xl);
  }
}

// ── Pinned ─────────────────────────────────────────
// The block is --pin-vh viewport-heights tall; its stage sticks for
// the whole travel, so the reader scrolls the device through its
// states with the copy held above it. The copy is visible from the
// first pixel of the pin: nothing on the page waits on scroll except
// what the device shows.
.pinned {
  --pin-vh: 2.5;
  height: calc(var(--pin-vh) * 100svh);

  &[data-static] {
    height: auto;
  }
}

.stage {
  position: sticky;
  top: 0;
  box-sizing: border-box;
  height: 100svh;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: var(--space-8);
  padding: calc(var(--space-10) + env(safe-area-inset-top, 0px)) var(--gutter-x)
    calc(var(--navbar-height) + env(safe-area-inset-bottom, 0px) + var(--space-6));
  max-width: var(--content-max);
  margin: 0 auto;

  [data-static] & {
    position: static;
    height: auto;
  }
}

// The device row: the frame fills what's left and clips its screen,
// so on a short phone viewport the top of the app is what shows.
.device {
  min-height: 0;
  display: flex;
  justify-content: center;
  align-items: flex-start;

  > * {
    max-height: 100%;
  }
}

// ── Arrival ────────────────────────────────────────
// Not pinned. The device does one state change when the section is
// on screen; the copy is plain flow.
.arrival {
  @include layout.stack(var(--space-8));
  box-sizing: border-box;
  padding: var(--section-gap) var(--gutter-x);
  max-width: var(--content-max);
  margin: 0 auto;
}
```

- [ ] **Step 2: Components**

`src/components/landing/Section.tsx`:

```tsx
"use client";

import { useRef, type ReactNode } from "react";
import { useInView, useScrollProgress } from "@/hooks/use-scroll-progress";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { stepAt } from "@/lib/scroll-progress";
import { DeviceFrame } from "./DeviceFrame";
import styles from "./section.module.scss";

interface CopyProps {
  headline: string;
  body: string;
  as?: "h1" | "h2";
}

/** One claim: headline and a sentence, centred. */
export function SectionCopy({ headline, body, as: Tag = "h2" }: CopyProps) {
  return (
    <div className={styles.copy}>
      <Tag className={styles.headline}>{headline}</Tag>
      <p className={styles.body}>{body}</p>
    </div>
  );
}

interface PinnedProps extends CopyProps {
  /** How many states the device walks through across the pin. */
  steps: number;
  deviceLabel: string;
  children: (step: number) => ReactNode;
}

/**
 * A section whose device changes state as the reader scrolls. The
 * copy is never gated: it is on screen from the first pixel of the
 * pin. Reduced motion renders the last state in normal flow.
 */
export function PinnedSection({ headline, body, steps, deviceLabel, children }: PinnedProps) {
  const ref = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();
  const progress = useScrollProgress(ref);
  const step = reduced ? steps - 1 : stepAt(progress, steps);

  return (
    <section ref={ref} className={styles.pinned} data-static={reduced ? "" : undefined}>
      <div className={styles.stage}>
        <SectionCopy headline={headline} body={body} />
        <div className={styles.device}>
          <DeviceFrame label={deviceLabel}>{children(step)}</DeviceFrame>
        </div>
      </div>
    </section>
  );
}

interface ArrivalProps extends CopyProps {
  deviceLabel: string;
  children: (step: 0 | 1) => ReactNode;
}

/** A section whose device makes one change once it is on screen. */
export function ArrivalSection({ headline, body, deviceLabel, children }: ArrivalProps) {
  const ref = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();
  const inView = useInView(ref);
  const step: 0 | 1 = reduced || inView ? 1 : 0;

  return (
    <section ref={ref} className={styles.arrival}>
      <SectionCopy headline={headline} body={body} />
      <DeviceFrame label={deviceLabel}>{children(step)}</DeviceFrame>
    </section>
  );
}
```

- [ ] **Step 3: Compile, typecheck, lint**

Run: `npx sass --load-path=src/styles --no-source-map src/components/landing/section.module.scss > /dev/null && pnpm typecheck && pnpm lint && pnpm test --run src/styles`
Expected: clean.

- [ ] **Step 4: Checkpoint**

Ready to commit as `feat(landing): a section is one claim and a device — pinned through its states, or changed once on arrival`.

---

### Task 8: Hero, ladder, quiet grid, made-by, close

**Files:**
- Create: `src/components/landing/Hero.tsx`, `hero.module.scss`
- Create: `src/components/landing/Ladder.tsx`, `ladder.module.scss`
- Create: `src/components/landing/QuietGrid.tsx`, `quietGrid.module.scss`
- Create: `src/components/landing/MadeBy.tsx`, `Close.tsx`, `closing.module.scss`

**Interfaces:**
- Consumes: copy (Task 4), `CardScreen` + `DeviceFrame` (Task 6), `useInView` + `useReducedMotion` (Task 2), `RevealText` from `@/components/motion`, `ChorkMark`, `LinkButton`, `SendGridTile` from `@/components/ui`.
- Produces: `<Hero />`, `<Ladder />`, `<QuietGrid />`, `<MadeBy />`, `<Close />` — no props.

- [ ] **Step 1: Hero**

`src/components/landing/hero.module.scss`:

```scss
@use "mixins/typography" as type;
@use "mixins/layout" as layout;
@use "mixins/breakpoints" as bp;

// The first screen: lock-up, headline, one sentence, one button, the
// phone. Everything rises once on first paint — not on scroll — and
// the stagger is one token so the beats are related.
.hero {
  --stagger-hero: 0.15s;
  @include layout.stack(var(--space-8));
  align-items: center;
  box-sizing: border-box;
  padding: calc(var(--space-12) + env(safe-area-inset-top, 0px)) var(--gutter-x) var(--space-10);
  max-width: var(--content-max);
  margin: 0 auto;
  text-align: center;
}

.brand {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  @include type.typography(label, $step: sm);
  color: var(--mono-text);
  animation: heroIn var(--duration-hero) var(--ease-out) both;
}

.headline {
  @include type.typography(display, $step: 4xl);
  color: var(--mono-text);
  max-width: 16ch;
  text-wrap: balance;

  @include bp.tablet {
    @include type.typography(display, $step: 6xl);
  }

  @include bp.desktop {
    @include type.typography(display, $step: 7xl);
  }
}

.body {
  @include type.typography(body, $step: lg);
  color: var(--mono-text);
  max-width: 36rem;
  text-wrap: pretty;
  animation: heroIn var(--duration-hero) var(--ease-out) var(--stagger-hero) both;

  @include bp.tablet {
    @include type.typography(body, $step: xl);
  }
}

.cta {
  animation: heroIn var(--duration-hero) var(--ease-out) calc(var(--stagger-hero) * 2) both;

  > * {
    min-width: 12.5rem;
  }
}

.device {
  width: 100%;
  animation: heroIn var(--duration-hero) var(--ease-out) calc(var(--stagger-hero) * 3) both;
}

.brand, .body, .cta, .device {
  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
}

@keyframes heroIn {
  from {
    opacity: 0;
    transform: translateY(var(--space-4));
  }
}
```

`src/components/landing/Hero.tsx`:

```tsx
import { RevealText } from "@/components/motion";
import { ChorkMark, LinkButton } from "@/components/ui";
import { HERO, LOG } from "./copy";
import { DeviceFrame } from "./DeviceFrame";
import { CardScreen } from "./CardScreen";
import styles from "./hero.module.scss";

/** What is this, is it for me, what does it cost, where do I start. */
export function Hero() {
  return (
    <section className={styles.hero}>
      <p className={styles.brand}>
        <ChorkMark size={20} mode="accent" />
        Chork
      </p>
      <RevealText as="h1" text={HERO.headline} className={styles.headline} />
      <p className={styles.body}>{HERO.body}</p>
      <div className={styles.cta}>
        <LinkButton href="/login">{HERO.cta}</LinkButton>
      </div>
      <div className={styles.device}>
        <DeviceFrame label={`Your card in Chork: ${LOG.deviceLabel.split(":")[0]}`}>
          <CardScreen step={0} />
        </DeviceFrame>
      </div>
    </section>
  );
}
```

Give the hero device its own plain label instead of that split — e.g. `label="Your card in Chork: where you stand, and every route on the set as a tile coloured by what you did."` — add `deviceLabel` to `HERO` in `copy.ts` and use `HERO.deviceLabel`.

- [ ] **Step 2: Ladder**

`src/components/landing/ladder.module.scss`:

```scss
@use "mixins/typography" as type;
@use "mixins/layout" as layout;
@use "mixins/breakpoints" as bp;

.ladder {
  @include layout.stack(var(--space-8));
  box-sizing: border-box;
  padding: var(--section-gap) var(--gutter-x);
  max-width: var(--content-max);
  margin: 0 auto;
}

// The lesson, as rows: the tile in its real state, the plain label,
// the number. Rows light in from the top when the section arrives,
// one beat apart.
.rows {
  --stagger-ladder: 0.08s;
  list-style: none;
  margin: 0 auto;
  padding: 0;
  width: 100%;
  max-width: var(--content-app);
  @include layout.stack(var(--space-3));
}

.row {
  display: grid;
  grid-template-columns: var(--size-avatar-podium) 1fr auto;
  align-items: center;
  gap: var(--space-4);
  opacity: 0;
  transform: translateY(var(--space-3));
  transition:
    opacity var(--duration-normal) var(--ease-out),
    transform var(--duration-normal) var(--ease-out);
  transition-delay: calc(var(--i) * var(--stagger-ladder));

  [data-in] & {
    opacity: 1;
    transform: none;
  }

  @media (prefers-reduced-motion: reduce) {
    opacity: 1;
    transform: none;
    transition: none;
  }
}

.label {
  @include type.typography(body, $step: lg);
  color: var(--mono-text);
}

.points {
  @include type.typography(number, $step: 3xl);
  color: var(--mono-text);
  text-align: right;
}
```

(`--size-avatar-podium` is the tile column's width — a named size on the avatar scale that is already the right order of magnitude for a tile. If a tile-size token exists — check `spacing.scss` for `--size-tile-*` — use that instead.)

`src/components/landing/Ladder.tsx`:

```tsx
"use client";

import { useRef, type CSSProperties } from "react";
import { SendGridTile } from "@/components/ui/SendGridTile/SendGridTile";
import { useInView } from "@/hooks/use-scroll-progress";
import { LADDER } from "./copy";
import { SectionCopy } from "./Section";
import styles from "./ladder.module.scss";

/** Fewer goes, more points — taught by the tiles themselves. */
export function Ladder() {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, 0.3);
  return (
    <section ref={ref} className={styles.ladder} data-in={inView ? "" : undefined}>
      <SectionCopy headline={LADDER.headline} body={LADDER.body} />
      <ol className={styles.rows} aria-label="What a send is worth">
        {LADDER.rows.map((row, i) => (
          <li key={row.label} className={styles.row} style={{ "--i": i } as CSSProperties}>
            <SendGridTile number={row.tile.number} state={row.tile.state} zone={"zone" in row.tile ? row.tile.zone : undefined} />
            <span className={styles.label}>{row.label}</span>
            <span className={styles.points}>{row.points}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
```

- [ ] **Step 3: Quiet grid**

`src/components/landing/quietGrid.module.scss`:

```scss
@use "mixins/typography" as type;
@use "mixins/layout" as layout;
@use "mixins/surfaces" as surface;
@use "mixins/container-queries" as cq;

.quiet {
  @include layout.stack(var(--space-6));
  box-sizing: border-box;
  padding: var(--section-gap) var(--gutter-x);
  max-width: var(--content-wide);
  margin: 0 auto;
  container: tile / inline-size;
}

.headline {
  @include type.typography(card-title, $step: xl);
  color: var(--mono-text);
  text-align: center;
}

// Dense on purpose: four small facts, not four feature cards. Two up
// on a phone, four across once the container allows it.
.grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-3);

  @include cq.split {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

.item {
  @include surface.card;
  @include layout.stack(var(--space-1));
  padding: var(--space-4);
  border-radius: var(--radius-card);
}

.title {
  @include type.typography(card-title, $step: md);
  color: var(--mono-text);
}

.body {
  @include type.typography(meta);
  color: var(--mono-text-low-contrast);
}
```

(Check `_container-queries.scss` for the mixin names — `cq.split` is what CLAUDE.md names; use whatever the file exports for the ~640px rung.)

`src/components/landing/QuietGrid.tsx`:

```tsx
import { QUIET } from "./copy";
import styles from "./quietGrid.module.scss";

/** The things worth knowing that have no screen of their own. */
export function QuietGrid() {
  return (
    <section className={styles.quiet} aria-labelledby="quiet-heading">
      <h2 id="quiet-heading" className={styles.headline}>{QUIET.headline}</h2>
      <ul className={styles.grid}>
        {QUIET.items.map((item) => (
          <li key={item.title} className={styles.item}>
            <h3 className={styles.title}>{item.title}</h3>
            <p className={styles.body}>{item.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 4: Made-by and the close**

`src/components/landing/closing.module.scss`:

```scss
@use "mixins/typography" as type;
@use "mixins/layout" as layout;

.madeBy {
  @include layout.stack(var(--space-4));
  align-items: center;
  text-align: center;
  box-sizing: border-box;
  padding: var(--section-gap) var(--gutter-x);
  max-width: var(--content-prose);
  margin: 0 auto;
}

.madeByHeadline {
  @include type.typography(display, $step: 3xl);
  color: var(--mono-text);
}

.madeByBody {
  @include type.typography(body, $step: lg);
  color: var(--mono-text);
  text-wrap: pretty;
}

.contact {
  @include type.typography(body, $step: lg);
  color: var(--mono-text);

  a {
    color: var(--accent-text);
    text-decoration: underline;
    text-underline-offset: 0.15em;
  }
}

// The only accent plane on the page: the sent tile at page scale.
.close {
  @include layout.stack(var(--space-6));
  align-items: center;
  text-align: center;
  box-sizing: border-box;
  padding: var(--section-gap) var(--gutter-x);
  background: var(--accent-solid);
  color: var(--accent-on-solid);
}

.closeHeadline {
  @include type.typography(display, $step: 4xl);
  color: var(--accent-on-solid);
  text-wrap: balance;
}

.closeAside {
  @include type.typography(body);
  color: var(--accent-on-solid);
  max-width: 36rem;
}
```

Check `colors.scss` for the accent text token name (`--accent-text` or `--accent-text-low-contrast`); on the page plane use the step-12 one. Also check how `LinkButton variant="secondary"` looks on `--accent-solid` — if it vanishes, the close's button needs a variant that is `--accent-on-solid` filled with accent text; add it to `ui.module.scss` as `btnOnAccent` and `LinkButton`'s `Variant` union, rather than styling the button from the landing folder.

`src/components/landing/MadeBy.tsx`:

```tsx
import { MADE_BY } from "./copy";
import styles from "./closing.module.scss";

export function MadeBy() {
  return (
    <section className={styles.madeBy}>
      <h2 className={styles.madeByHeadline}>{MADE_BY.headline}</h2>
      <p className={styles.madeByBody}>{MADE_BY.body}</p>
      <p className={styles.contact}>
        <a href={`mailto:${MADE_BY.contact}`}>{MADE_BY.contact}</a> {MADE_BY.contactNote}
      </p>
    </section>
  );
}
```

`src/components/landing/Close.tsx`:

```tsx
import { LinkButton } from "@/components/ui";
import { CLOSE } from "./copy";
import styles from "./closing.module.scss";

export function Close() {
  return (
    <section className={styles.close}>
      <h2 className={styles.closeHeadline}>{CLOSE.headline}</h2>
      <LinkButton href="/login" variant="secondary">{CLOSE.cta}</LinkButton>
      <p className={styles.closeAside}>{CLOSE.aside}</p>
    </section>
  );
}
```

- [ ] **Step 5: Compile every new stylesheet; typecheck; lint; design-system tests**

Run:
```bash
for f in src/components/landing/{hero,ladder,quietGrid,closing}.module.scss; do npx sass --load-path=src/styles --no-source-map "$f" > /dev/null || echo "FAIL $f"; done
pnpm typecheck && pnpm lint && pnpm test --run src/styles
```
Expected: clean.

- [ ] **Step 6: Checkpoint**

Ready to commit as `feat(landing): hero, the scoring ladder, the quiet grid, made-by and the close`.

---

### Task 9: Assemble the page, delete the old one, drop the exemption

**Files:**
- Rewrite: `src/app/landing.tsx`, `src/app/landing.module.scss`
- Restore: `src/app/page.tsx` (`git checkout -- src/app/page.tsx` removes the `?variant=` branch — it is the only diff)
- Delete: `src/components/landing/variants/`; `src/components/landing/{DemoTile,HeroGrid,FeatureGrid,HowItWorksSection,ScoringSection,FadeIn,InView,HeroSection}.tsx`, their `.module.scss` and `.stories.tsx`
- Modify: `src/styles/design-system.test.ts:18-23, 40, 90, 190, 200, 447, 846`
- Modify: `src/app/robots.ts:17`

**Interfaces:**
- Consumes: everything from Tasks 6–8.

- [ ] **Step 1: The page**

`src/app/landing.tsx`:

```tsx
import { SiteFooter } from "@/components/landing/SiteFooter";
import { Hero } from "@/components/landing/Hero";
import { PinnedSection, ArrivalSection } from "@/components/landing/Section";
import { CardScreen } from "@/components/landing/CardScreen";
import { BoardScreen } from "@/components/landing/BoardScreen";
import { GameScreen } from "@/components/landing/GameScreen";
import { Ladder } from "@/components/landing/Ladder";
import { QuietGrid } from "@/components/landing/QuietGrid";
import { MadeBy } from "@/components/landing/MadeBy";
import { Close } from "@/components/landing/Close";
import { CARD_STEPS } from "@/components/landing/screens/cardScreen";
import { BOARD_STEPS } from "@/components/landing/screens/boardScreen";
import { ANYWHERE, BOARD, LOG } from "@/components/landing/copy";
import styles from "./landing.module.scss";

/**
 * The logged-out homepage. A sequence of screens, each one claim and
 * the product doing the thing — the real app on a phone, with
 * fixture data, changing state as the reader scrolls. The order is
 * the order a stranger asks in: what is this, how do I use it, how is
 * it scored, where do I stand, can I run my own, what else, who made
 * it, how do I join. See docs/superpowers/specs/2026-09-30-marketing-page-design.md.
 */
export function LandingPage() {
  return (
    <div className={styles.page}>
      <Hero />

      <PinnedSection headline={LOG.headline} body={LOG.body} steps={CARD_STEPS} deviceLabel={LOG.deviceLabel}>
        {(step) => <CardScreen step={step} />}
      </PinnedSection>

      <Ladder />

      <PinnedSection headline={BOARD.headline} body={BOARD.body} steps={BOARD_STEPS} deviceLabel={BOARD.deviceLabel}>
        {(step) => <BoardScreen step={step} />}
      </PinnedSection>

      <ArrivalSection headline={ANYWHERE.headline} body={ANYWHERE.body} deviceLabel={ANYWHERE.deviceLabel}>
        {(step) => <GameScreen step={step} />}
      </ArrivalSection>

      <QuietGrid />
      <MadeBy />
      <Close />
      <SiteFooter />
    </div>
  );
}
```

`src/app/landing.module.scss`:

```scss
// The page is its sections; each owns its own rhythm (the hero open,
// the pinned sections a viewport each, the quiet grid dense, the
// close full-bleed). Bottom clearance for the nav pill lives on
// SiteFooter.
.page {
  overflow-x: clip;
}
```

- [ ] **Step 2: Delete the old surface**

```bash
git checkout -- src/app/page.tsx
rm -r src/components/landing/variants
cd src/components/landing && rm DemoTile.tsx demoTile.module.scss DemoTile.stories.tsx \
  HeroGrid.tsx heroGrid.module.scss HeroGrid.stories.tsx \
  FeatureGrid.tsx featureGrid.module.scss FeatureGrid.stories.tsx \
  HowItWorksSection.tsx howItWorksSection.module.scss HowItWorksSection.stories.tsx \
  ScoringSection.tsx scoringSection.module.scss ScoringSection.stories.tsx \
  FadeIn.tsx fadeIn.module.scss InView.tsx \
  HeroSection.tsx heroSection.module.scss HeroSection.stories.tsx
```

Then `grep -rn "landing/\(DemoTile\|HeroGrid\|FeatureGrid\|HowItWorks\|ScoringSection\|FadeIn\|InView\|HeroSection\|variants\)" src` must print nothing. If `mixins/_brand-dot.scss` or a `--duration-*` token was used only by the deleted hero, leave them — a token with no caller is not a bug.

- [ ] **Step 3: Drop the `MARKETING` exemption**

In `src/styles/design-system.test.ts`:
- Delete `const MARKETING = ["components/landing/"];` and `const notMarketing = …`.
- Line ~190 (`never sets a raw px/rem font-size`): remove the `notMarketing` argument.
- Line ~200 (`never sets a raw line-height`): same.
- Line ~447: delete `if (notMarketing(path)) return;`.
- Line ~846: `const exempt = (p: string) => p.startsWith("components/ui/") || p.endsWith(".stories.tsx");`.
- Header comment lines 18–23: replace the marketing sentence with `* Marketing surfaces (components/landing/) are under every rule; the exemption went with the page that needed it (2026-09-30).`

- [ ] **Step 4: `robots.ts`**

Change `allow: ["/", "/how-it-works", "/u/"],` to `allow: ["/", "/u/"],`.

- [ ] **Step 5: Full check plus a Sass compile of every landing stylesheet**

Run:
```bash
for f in src/components/landing/*.module.scss src/app/landing.module.scss; do npx sass --load-path=src/styles --no-source-map "$f" > /dev/null || echo "FAIL $f"; done
pnpm check
```
Expected: no `FAIL`; `pnpm check` clean, including `design-system.test.ts` now covering the landing folder. Fix any rule it raises by adding the missing token, never by re-widening the exemption.

- [ ] **Step 6: Build**

Run: `pnpm build`
Expected: succeeds. (Sass errors and the `react-hooks/purity` rule both surface here if they slipped past the test.)

- [ ] **Step 7: Checkpoint**

Ready to commit as `feat(marketing): the homepage is the app on a phone — one claim per screen, real components, scroll-driven`.

---

### Task 10: See it — phone, desktop, reduced motion, both modes

**Files:** none new. Fixes go in the file that owns the problem.

- [ ] **Step 1: Run it**

Run: `pnpm dev`, then open `http://localhost:3000/` in a browser that is **signed out** (a private window). Use Claude in Chrome to walk it if available; otherwise Tom drives and reports.

- [ ] **Step 2: Walk the page at 390 wide (phone) and check each of these**

1. Hero: wordmark → headline → sentence → button → phone, rising once. The phone shows the rank strip, legend and tiles; nothing is clipped that matters.
2. "Log a send in two taps": the stage pins; scrolling steps the device 0→4; the sheet rises inside the screen; the tile turns green; the pin releases and the ladder scrolls in normally. The copy is readable from the moment the section pins.
3. Ladder rows light in top to bottom, once.
4. "See where you stand": rows slide; the podium rebuilds with you on it at the last step.
5. "Run your own competition": route 5 turns amber and you slide to first as it comes on screen.
6. Quiet grid is two-up; made-by; the close is lime edge to edge; footer clears the nav pill.
7. Nothing on the page is a tab stop except the two CTAs, the mailto, the footer links and the nav pill (press Tab through it).

- [ ] **Step 3: 1440 wide**

Devices are zoomed (1.2), headline at 72px, measure ≤ 60ch, ~60% of each pinned screen empty. No horizontal scroll (`overflow-x: clip` on `.page`).

- [ ] **Step 4: Reduced motion**

Chrome DevTools → Rendering → *Emulate CSS prefers-reduced-motion: reduce*. Every pinned section is normal flow showing its **end** state (sheet closed, tile green; you third; you first). Nothing is empty, nothing pins. Hero renders in place.

- [ ] **Step 5: Light mode**

Toggle OS appearance. The bezel is still hardware-dark on the light page, the close is still lime with dark ink, body copy is step 12, the quiet cards are cards.

- [ ] **Step 6: Record**

If Claude in Chrome is driving, record a GIF of the phone-width walk (`marketing_walk.gif`) so the scroll behaviour is reviewable; otherwise note what was checked in the checkpoint message.

- [ ] **Step 7: Checkpoint**

Ready to commit any fixes as `fix(marketing): <what the walk found>`. Then ask Tom for the go-ahead on the whole stack of checkpoints (Tasks 1–10), in order.

---

## Self-review

**Spec coverage.** Chrome — Task 8 (lock-up in the hero; nav pill untouched). Hero — Task 8. §2 log sequence — Tasks 5/6/9. §3 ladder — Task 8. §4 board — Tasks 5/6/9. §5 game — Tasks 5/6/9. §6 quiet — Task 8. §7 made-by — Task 8. §8 close + footer — Tasks 8/9. Device (`inert`, `role="img"`, no transform, `zoom` on desktop) — Task 6. Fixtures from the mock factories with privacy pinned — Task 4. Pure screen functions with a test per step — Task 5. Motion rules (sticky pin, IO + rAF hook, tokens only, reduced-motion end state, `--ease-out`) — Tasks 2/7. Craft (type steps beyond 5xl, tokens for radius/size) — Task 1. Deletions, exemption, robots — Task 9. Testing section: fixtures typecheck ✓, screen tests ✓, `progressToStep`→`stepAt` tests ✓, attempt-privacy test ✓, design-system over landing ✓, Sass compile in verification ✓, visual check ✓ (Task 10). Open questions in the spec (founder wording, gym-trial line, "tell them" line) are copy edits in `copy.ts` and don't block.

**Placeholders.** None; every step carries its code. Two places say "check X and use the app's string/token" (button label in Task 6 Step 2; accent text token and `cq.split` name in Task 8) — those are look-ups against files the implementer has, not deferred design.

**Type consistency.** `cardScreenAt` returns `{ logs, sheet, rank }` and `CardScreen` destructures exactly that. `boardScreenAt` returns `{ entries }`; `BoardScreen` maps with `toLeaderboardRowData` (Task 3 kept its signature). `gameScreenAt` returns `{ tiles, rows: LeaderboardRowData[] }`; `GameScreen` and `BoardRows` consume `LeaderboardRowData`. `stepAt(progress, steps)` — used in `PinnedSection` with the same argument order. `useInView(ref, threshold)` — `Ladder` passes `0.3`, `ArrivalSection` takes the default. `TileGrid` takes `children` + `className`. Fixture arithmetic, checked by hand and pinned by `fixtures.test.ts`: logs → 18 points, 2 flashes; board 40 / 34 / 27 / 20 / 18; card step 4 → 21 (fourth, 7 off third); board steps 18 → 23 → 28 (fourth, then third); game 13 → 17 past 16.
