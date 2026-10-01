# Marketing page — design

**Status:** approved in conversation 2026-09-30, awaiting spec read
**Date:** 2026-09-30
**Supersedes:** `2026-09-16-marketing-site-redesign-design.md` (deleted;
its copy rules and evidence are folded in below)
**Scope:** the logged-out homepage (`/`), its chrome and footer. Privacy,
terms and the OG image follow in a later pass on the same ground.

---

## What went wrong twice, in one paragraph

Round one built three full pages that were "super cheap, amateur".
Round two built six one-screen directions (A–F, `?variant=`) and none
landed: amateur, didn't explain the product, gimmicky, and not the
reference class. Both rounds drew a *sketch* of the app (`DemoTile`,
`HeroGrid`, bespoke mock grids) and then reached for devices — giant
numerals, join codes, scan lines, spines — to make the sketch
interesting. The 16 Sep spec fixed the message and still got round two,
because the message was never the whole problem: the page had nothing
real to show.

## The three decisions this page is built on

1. **Reference class: Apple product pages.** Centred, generous, one
   claim per viewport, product shown enormous and flawless, short
   plain copy, calm scroll-driven sequences. Distinctiveness comes from
   the app's own palette and type, never from an unusual structure.
2. **The imagery is the real app.** Every device on the page mounts the
   actual components — `SendGridTile`, `RankStrip`, `LeaderboardRow`,
   `Podium`, the game screen — with fixture data, inside a CSS device
   frame. Pixel-identical to the app, crisp at any size, follows theme,
   and its state can change as the reader scrolls. **If a real
   component can't be mounted with fixtures, fix the component; never
   draw an approximation.** `DemoTile`, `HeroGrid` and the `variants/`
   folder are deleted.
3. **Scroll-driven, section by section.** Each section owns its own
   pinned sequence (Apple's actual pattern), never one phone pinned
   for the whole page and never a static page. The 16 Sep motion ban
   is overturned; the reasons are under Motion.

Hero claim: **keep score with your mates.** The gym's set and
"anywhere" are both just *where*. The gym is the buyer, but a climber
whose gym isn't on Chork must not bounce off the first line.

---

## Copy rules (unchanged from 16 Sep)

- **Plain headings.** Every heading states what its section is about
  in words a stranger already owns. Nothing coined, nothing that only
  makes sense after reading the body ("Tap it. That's the log." is the
  named failure).
- **"Game"** is the app's word; the marketing page may say
  **"competition"** where a stranger needs it. Never "match".
- **No permanence promises.** "Free to join" only. Never "free
  forever".
- **Never show or imply another climber's attempt count**, including
  in fixture data. Points and flashes are public.
- **No invented social proof** — no counters, testimonials, ratings or
  gym logos until true and permitted. A gym's name needs its written
  agreement (UK DMCC Act 2024 Sch. 20 / ASA).
- **Plain language**, 5th–7th grade. Grade literacy assumed; the points
  system is taught, because outdoor climbing has none.
- **"Chorkboard" does not appear.** "Leaderboard" does.
- Marketing says "mates"; the app's label stays "Friends".

---

## The page

Chrome: the app's own nav pill, which lives at the bottom of the
viewport and, logged out, already carries the word **Chork** and one
**Sign in** tab (`UnauthenticatedNav`). A second bar at the top would
be the same two things twice. Because the pill is at the bottom, the
hero opens with a small wordmark lock-up — glyph plus the word, never
the glyph alone — above the H1, so the name is the first thing on the
page. Nothing else competes with the hero's call to action. The page
sits on the app's own `PageBackdrop` ground and follows OS light/dark
like everything else.

Each screen below is one claim: a short headline, one or two
sentences, and the product doing the thing. Roughly 60% of every
viewport is empty.

### 1. Hero

> **Log your sends. Compete with your mates.**
>
> Chork turns every route you climb into points and puts you on a
> leaderboard with your friends — at your gym, or anywhere you climb.
> Free to join, nothing to install.
>
> [ **Join for free** ]

Below the copy, the device at hero scale showing the Card: the rank
strip, the legend and the real send grid — twenty routes, five rows,
so the screen is full of tiles the way a wall is. The "Current set" stats card that sits between them in the app
is left out of every device on this page — with it, the tiles start
~400px down and a phone-height device clips them, and the tiles are
the thing being shown.
The copy and device rise into place once on first paint (`RevealText`
+ one opacity/translate) and nothing else on this screen moves. No
badge above the H1, no stat row, no second CTA.

### 2. Log a send in two taps.

> Tap the route you climbed and how many goes it took. That's it.

**Pinned sequence.** As the reader scrolls: an untouched tile is
tapped → the log sheet opens → attempts tick 1 → 2 → the sheet closes
→ the tile turns lime. Four states, each held for a fraction of the
pin.

### 3. Fewer goes, more points.

> A flash is worth 4. Every extra go costs a point. Reach the zone and
> you still score.

The horizontal bar chart — `ScoringChart`, the same component the
Chorkboard's "How scoring works" card uses, on the shared
`SCORING_ROWS`. Flash gold, sends lime, the zone teal, each bar's
length its points. It grows in on view; reduced motion shows it at
length. (A ladder of tiles was built first and read worse than the
bars the old page had — the bars stay.)

### 4. See where you stand.

> Everyone climbing the same set shares one leaderboard. Log a send
> and it updates straight away.

**Pinned sequence.** The real leaderboard on the device: the `Podium`
and the rows under it. You start third, on the bottom step; as the
reader scrolls, your points climb and you move up the podium — to
second, then first, with the crown. The columns are keyed by climber
and a FLIP (`useFlip`, anchored to the podium's floor) slides each one
to its new place, so your lime plinth travels and grows rather than
you reappearing somewhere else. The podium's entrance animation is off
here (`entrance={false}`): a moved column is a re-inserted node, and
re-insertion restarts a CSS animation, which faded every climber the
move touched back in from nothing. Fixture climbers show points and
flashes only.

(A rows-only version was tried in between and dropped: the podium is
the board's picture, and moving up it is the point.)

### 5. Run your own competition, anywhere.

> Pick the routes, share a link, and Chork keeps score. Gym, crag or
> home wall — your gym doesn't need to be on Chork.

The device shows a live game screen (the app's word: "game") with a
handful of routes and seats. One in-screen state change on arrival: a
route gets a send and the standings reorder. No join code anywhere.

### 6. Private, offline, nothing to install.

Four small dense tiles under a heading that says what they are — not
"also worth knowing", which was coy:

- **Attempts are private.** Points and flashes are public; how many
  goes it took is yours.
- **Beta stays hidden.** Someone's hint stays covered until you've
  sent the route yourself.
- **Works offline.** Log it in the basement; it catches up later.
- **No app store.** Runs in your browser and installs to your home
  screen.

### 7. Get in touch.

> Questions, ideas, or want Chork at your gym? Email hello@chork.app.

One plain line. The founder story that stood here ("built by one
person… it's early") read as apology, and was cut.

### 8. Join Chork for free.

A full-bleed plane on `--accent-solid`: the Chork mark, the headline
and one button, all in the plane's own ink (`--accent-on-solid` — dark
on lime, white on the blue / violet / pink chords), so it reads the
same in both modes and every theme. The button is `LinkButton
variant="onAccent"`: `secondary` there was the page plane with a grey
border, which looked like a form field dropped on the lime in light
mode. The "tell them about it" line is gone.

Footer beneath: privacy, terms, contact, copyright.

---

## The device

One `DeviceFrame` in `components/landing/`: a phone-shaped frame
(rounded rect, bezel, no notch theatre) whose screen is ordinary app
UI laid out at its natural width, `--content-narrow` (360px). The
screen is `inert` and the frame is `role="img"` with a label: the
device is a picture of the app, not a second copy of it to tab through.

**It scales, it never squeezes.** Below ~334px of screen the real
components wrap ("#3 of / 23" in the rank strip, board handles), so
the frame keeps the app at 360 and `zoom`s the whole phone to its
column. The frame is its own named `tile` container and picks the
zoom by column width (CSS can't divide one length by another to get
the exact factor): 0.75 under 20rem (a 320 phone), 0.85 under 21.25rem
(360 Android), 0.9 under 23.75rem (375 / 390 iPhone), 1 above — and
1.2 on a desktop, except a short one (≤720px tall, e.g. a 1366×768
laptop's 657px viewport), where the bigger phone clipped its own sheet
and podium. `useFlip` divides out the zoom so a move never overshoots.

**Too short to pin.** Under 480px tall (a landscape phone) a pinned
section doesn't pin: it renders its end state in normal flow, as
reduced motion does. `bp.short` (≤720px) tightens the pinned stage and
drops the headline a step so the device keeps its height.

Fixtures live in `components/landing/fixtures.ts`: one set, ~12
routes, one climber ("you") and four others with usernames, points and
flashes. No attempt counts for anyone but "you". Built from the
`src/test/mocks.ts` factories so a migration that adds a column breaks
the build here too.

Sequenced screens are pure functions of a step index —
`cardScreenAt(step)`, `boardScreenAt(step)` — returning the props for
the real components, with a unit test each pinning the state at every
step (the reducer-test pattern). The scroll hook only supplies the
step.

---

## Motion

The 16 Sep ban on scroll choreography is overturned because the
reference class is scroll-driven and the ban's evidence was about
scroll-*gated* primary copy. What stays banned is exactly that:
**copy never waits on scroll.** Only the device's state and a short
arrival fade are scroll-linked; every sentence is readable the moment
its section is on screen.

- **Pinned sequences** (`position: sticky` on the section's visual,
  section height = pin length) release within three viewport-heights.
  A `useScrollProgress(ref)` hook — `IntersectionObserver` to
  activate, one `requestAnimationFrame`-throttled scroll read while
  active — yields 0–1; the section maps it to a step. No library.
- Step changes animate with the components' own CSS transitions (tile
  background, sheet enter, row reorder via `transform`), on the motion
  tokens. Bare literals in `animation` / `transition` stay rejected.
- Arrivals: opacity + ≤16px translate, `--duration-normal`,
  `--ease-out`. Never `--ease-out-expo` (reads as a pop).
- No parallax, no scrolljacking, no auto-rotating anything, nothing
  that moves for more than five seconds without a pause.
- `prefers-reduced-motion`: every sequence renders its **end** state,
  pins become normal flow. Never an empty state.
- `animation-timeline: scroll()` may replace the hook per section under
  `@supports` only; the hook is the baseline.
- Firefox pauses in-page animation during view transitions
  (`view-transitions.scss`); the landing page has no route transition
  into it, so nothing to add.

---

## Craft

- **Type:** the app's `display` preset for every headline, stepped
  large (`4xl`/`5xl`); `body` at a large step for the one-liners.
  Weight and colour carry hierarchy, never size alone. Measure 45–75ch.
  Uppercase only via a preset. No `vw` font sizes — the one remaining
  `MARKETING` waiver was for those and the rebuild drops it, so the
  landing folder is under the full `design-system.test.ts` and the
  exemption goes.
- **Layout:** `layout.page` on the same content widths as the app;
  everything centred; asymmetry only inside the grid (the ladder's
  numerals right, labels left). Section rhythm is deliberately
  unequal: hero and close open, the quiet grid dense.
- **Colour:** the chord does the work. Lime means sent, amber means
  flash, teal means zone, everywhere on the page as in the app. The
  close is the only accent plane. No gradient orbs, no glow, no
  `color-mix`.
- **Radius:** `--radius-*` and the golden inner tokens for the frame's
  bezel-to-screen step.
- **Buttons:** `LinkButton` primary for both CTAs. Round chrome
  (`IconLink` / `IconButton`) where the page has any.
- **Not on the page:** numbered 1-2-3 cards, thin-line icon trios,
  stat rows, badge above H1, join code, oversized numerals outside the
  ladder, decorative texture, emoji, testimonials.

---

## What gets deleted

- `src/components/landing/variants/` and the `?variant=` branch in
  `src/app/page.tsx` (throwaway from round two).
- `DemoTile`, `HeroGrid`, `FeatureGrid`, `HowItWorksSection`,
  `ScoringSection`, `FadeIn`, `InView`, their stories and styles.
  `HeroSection` and `SiteFooter` are rebuilt or replaced on the new
  ground; `SiteFooter` likely survives.
- The `MARKETING` exemption in `src/styles/design-system.test.ts`, and
  the stale `/how-it-works` allow in `robots.ts`.
- `docs/superpowers/specs/2026-09-16-marketing-site-redesign-design.md`.

---

## Testing

- `fixtures.ts` built from the mock factories: typecheck is the test.
- `cardScreenAt` / `boardScreenAt` / ladder steps: unit tests per step.
- `useScrollProgress`: pure mapping (`progressToStep`) unit-tested; the
  hook itself is wiring.
- Attempt privacy: a test asserting no fixture climber other than
  "you" carries an attempt count, and that no rendered board row
  prints one.
- `design-system.test.ts` runs over `components/landing/` with no
  exemption.
- A `sass --load-path=src/styles` compile of the landing stylesheets
  in the verification sequence: neither eslint nor vitest compiles
  Sass, so a broken sheet otherwise surfaces only at build.
- Visual check on a real phone and at 1440 before it ships: pins
  release cleanly, reduced motion shows end states, light and dark
  both hold.

---

## Open

1. **Gym trial line** — "currently being trialled with a gym in ⟨city⟩"
   is true and needs no permission; in or out, and which city.
