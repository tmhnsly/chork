# Self-hosted fonts

These are served from our own origin rather than fetched from Google.

**Why.** `next/font/google` resolves the font at *build* time, so a
build that can't reach `fonts.gstatic.com` fails outright — which is
exactly what killed the production deploy for `732983b` on
2026-08-14 while the preview build of the identical tree had
succeeded two minutes earlier. The OG image routes had the same
dependency at *request* time, on a path a share link hits cold.
Self-hosting removes a third party from both, and is faster besides:
no extra DNS + TLS + round-trip before the first paint.

**Licensing.** All three families are SIL Open Font License 1.1,
which permits redistribution. The licence text for each ships in
`licenses/` — keep it there, that's the condition.

## What's here

| File | Used by | Notes |
|---|---|---|
| `outfit-latin.woff2` | web — `--font-outfit` | Variable, 100–900 |
| `inter-latin.woff2` | web — `--font-inter` | Variable, 100–900 |
| `archivo-italic-latin.woff2` | web — `--font-display-italic` | Variable italic, 700–900 |
| `outfit-600.woff` | OG images | Satori can't parse woff2 |
| `outfit-900.woff` | OG images | ditto |

All are the **latin** subset, matching the `subsets: ["latin"]` these
replaced. Variable files cover the whole weight axis in one download,
so adding a weight costs nothing.

## Changing a font

Everything routes through `src/lib/fonts.ts` — one entry per family,
each mapping a file to the CSS variable the design system reads. To
swap a family:

1. Drop the new `.woff2` here (latin subset, variable if available).
2. Change that family's `src` and `weight` range in `src/lib/fonts.ts`.
3. Add its licence to `licenses/`.

The CSS variable name stays the same, so **nothing in `src/styles`
changes** — `--font-outfit` and friends keep resolving, and every
`@include type.typography(...)` follows automatically.

If the family is used in OG images too, also add a Satori-readable
static (`.woff`, `.ttf` or `.otf` — **not** `.woff2`) and point
`OG_FONT_FILES` in `src/lib/og-fonts.ts` at it.

## Refetching

`scripts/fetch-fonts.mjs` re-downloads every file above from Google
Fonts. Run it when bumping a family to a new upstream version.
