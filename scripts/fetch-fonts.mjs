/**
 * Re-download the self-hosted font files from Google Fonts.
 *
 * Run when bumping a family to a new upstream version:
 *     node scripts/fetch-fonts.mjs
 *
 * These files are committed, so this is not part of the build — the
 * whole point of self-hosting is that a build never talks to Google.
 * See `src/fonts/README.md`.
 */
import { writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "src", "fonts");

// A modern UA gets woff2 (small, what browsers want). A legacy one
// gets woff/ttf, which is all Satori can parse for OG images.
const UA_MODERN =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
const UA_LEGACY =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:10.0) Gecko/20100101 Firefox/10.0";

/** Web faces: variable, latin subset, woff2. */
const WEB = [
  { file: "outfit-latin.woff2", spec: "Outfit:wght@100..900" },
  { file: "inter-latin.woff2", spec: "Inter:wght@100..900" },
  { file: "archivo-italic-latin.woff2", spec: "Archivo:ital,wght@1,700..900" },
];

/** OG faces: static weights in a Satori-readable format. */
const OG = [
  { weight: 600, family: "Outfit" },
  { weight: 900, family: "Outfit" },
];

async function css(spec, ua) {
  const url =
    "https://fonts.googleapis.com/css2?family=" +
    encodeURIComponent(spec) +
    "&display=swap";
  const res = await fetch(url, { headers: { "User-Agent": ua } });
  if (!res.ok) throw new Error(`css ${spec}: HTTP ${res.status}`);
  return res.text();
}

async function download(url, ua) {
  const res = await fetch(url, { headers: { "User-Agent": ua } });
  if (!res.ok) throw new Error(`font ${url}: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Google emits one @font-face per subset. The `latin` one is the block
 * whose unicode-range starts at U+0000-00FF — that's what
 * `subsets: ["latin"]` used to select.
 */
function latinFaceUrl(text) {
  for (const block of text.split("@font-face")) {
    if (!block.includes("U+0000-00FF")) continue;
    const m = block.match(/src:\s*url\((https:\/\/[^)]+)\)/);
    if (m) return m[1];
  }
  return null;
}

await mkdir(OUT, { recursive: true });

for (const { file, spec } of WEB) {
  const url = latinFaceUrl(await css(spec, UA_MODERN));
  if (!url) throw new Error(`no latin face for ${spec}`);
  const buf = await download(url, UA_MODERN);
  await writeFile(join(OUT, file), buf);
  console.log(`${file.padEnd(30)} ${buf.length.toLocaleString()} bytes`);
}

for (const { weight, family } of OG) {
  const text = await css(`${family}:wght@${weight}`, UA_LEGACY);
  const m = text.match(
    /src:\s*url\((https:\/\/[^)]+)\)\s*format\('(opentype|truetype|woff)'\)/,
  );
  if (!m) throw new Error(`no Satori-readable face for ${family} ${weight}`);
  const ext = { truetype: "ttf", opentype: "otf", woff: "woff" }[m[2]];
  const buf = await download(m[1], UA_LEGACY);
  const file = `${family.toLowerCase()}-${weight}.${ext}`;
  await writeFile(join(OUT, file), buf);
  console.log(`${file.padEnd(30)} ${buf.length.toLocaleString()} bytes (${m[2]})`);
}

console.log("\nDone. Licences in src/fonts/licenses must stay alongside.");
