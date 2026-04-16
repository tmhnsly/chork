// Regenerate public/og-image.png — Open Graph / Twitter card art.
//
// Run with: `pnpm exec node scripts/gen-og.mjs`
//
// Prerequisite: Outfit Bold + Inter Regular available via fontconfig.
// Sharp's SVG rasteriser uses librsvg, which queries fontconfig by
// family name. Without the brand fonts installed it silently falls
// back to whatever else is around (Liberation Sans, DejaVu, …) — the
// resulting image *looks* generic but only catches the eye on QA
// when you compare it against the live site.
//
// One-time setup:
//   mkdir -p ~/.local/share/fonts/og-brand
//   curl -sL https://github.com/Outfitio/Outfit-Fonts/raw/main/fonts/ttf/Outfit-Bold.ttf \
//        -o ~/.local/share/fonts/og-brand/Outfit-Bold.ttf
//   curl -sL https://github.com/google/fonts/raw/main/ofl/inter/'Inter[opsz,wght].ttf' \
//        -o ~/.local/share/fonts/og-brand/Inter.ttf
//   fc-cache -f ~/.local/share/fonts
//   fc-list | grep -iE "outfit|inter"   # verify both register
//
// Fonts intentionally NOT vendored into the repo — keeps the source
// tree small. The output PNG is the artefact we ship.

import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ICON = path.join(REPO, "public/icon-512-dark.png"); // pale C + lime ball, sits well on the dark bg
const OUT = path.join(REPO, "public/og-image.png");

const W = 1200;
const H = 630;
const BG = "#111210";
const FG = "#F5F5F4";
const FG_DIM = "#a3a39d";

const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <rect width="${W}" height="${H}" fill="${BG}" />

  <!-- Wordmark + tagline, optically centred. Icon is composited
       separately by sharp so its colour stays untouched. -->
  <g transform="translate(420, 280)">
    <text x="0" y="0"
          font-family="Outfit"
          font-weight="700"
          font-size="156"
          letter-spacing="-6"
          fill="${FG}">Chork</text>
    <text x="6" y="78"
          font-family="Inter"
          font-weight="400"
          font-size="36"
          letter-spacing="-0.5"
          fill="${FG_DIM}">Bouldering competitions, scored.</text>
  </g>
</svg>
`;

const iconBuf = await sharp(ICON).resize(280, 280).toBuffer();
const svgBuf = Buffer.from(svg);

await sharp({
  create: {
    width: W,
    height: H,
    channels: 4,
    background: BG,
  },
})
  .composite([
    { input: svgBuf, top: 0, left: 0 },
    { input: iconBuf, top: 175, left: 110 },
  ])
  .png()
  .toFile(OUT);

const stat = fs.statSync(OUT);
console.log(`wrote ${OUT} (${stat.size} bytes)`);
