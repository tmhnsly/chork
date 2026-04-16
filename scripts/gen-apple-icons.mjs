// Regenerate apple-touch-icon variants — iOS PWA home-screen icons.
//
// Run with: `pnpm exec node scripts/gen-apple-icons.mjs`
//
// Produces:
//   public/apple-touch-icon-light.png (180×180, lime bg)
//   public/apple-touch-icon-dark.png  (180×180, near-black bg)
//
// iOS 16.4+ respects `media="(prefers-color-scheme: ...)"` on
// <link rel="apple-touch-icon">, so we ship both and let the
// system pick the match at PWA install time. (Post-install theme
// flips don't update the home-screen icon — iOS caches it —
// there's no workaround for that.)
//
// Design: each variant has an OPAQUE background so the icon reads
// the same on any home-screen wallpaper, and the brand mark (the
// "Chork C") is tinted to contrast its own background. The lime
// dot stays lime on the dark variant (brand accent); on the light
// variant everything is dark-on-lime so the "ball" reads as a
// punched-out hole — same silhouette, mode-appropriate palette.

import sharp from "sharp";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_LIGHT = path.join(REPO, "public/apple-touch-icon-light.png");
const OUT_DARK = path.join(REPO, "public/apple-touch-icon-dark.png");

const SIZE = 180;

// The brand mark at 48×48 sizes neatly; scale up 3.75× to fit in
// the 180×180 canvas with 16px breathing-room padding. viewBox
// stays 48×48 so SVG coords match the notification-icon and web
// favicon.
function svgFor({ bg, arc, dot }) {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 48 48">
      <rect width="48" height="48" fill="${bg}" rx="10" />
      <g transform="translate(0, 0)">
        <path d="M29 11 A14 14 0 1 0 29 37" fill="none" stroke="${arc}" stroke-width="10" stroke-linecap="round" />
        <circle cx="38" cy="24" r="7.5" fill="${dot}" />
      </g>
    </svg>
  `;
}

async function render(outPath, colours) {
  await sharp(Buffer.from(svgFor(colours)))
    .png()
    .toFile(outPath);
  console.log(`wrote ${outPath}`);
}

await render(OUT_LIGHT, {
  bg: "#bdee63", // lime
  arc: "#1b1d16", // dark olive
  dot: "#1b1d16", // same dark — "ball" reads as a punched hole on the lime plate
});

await render(OUT_DARK, {
  bg: "#111210", // near-black
  arc: "#ecede8", // pale cream
  dot: "#bdee63", // lime accent
});
