import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Font loader for the `next/og` (Satori) image routes.
 *
 * Reads from disk rather than fetching Google Fonts. The old version
 * made two network calls per render — CSS, then the font file — on a
 * path that a share link hits cold, and a Google outage would have
 * taken every OG image with it. See `src/fonts/README.md`.
 *
 * **Satori cannot parse woff2.** That is why these are separate files
 * from the ones the web uses: `.woff` / `.ttf` / `.otf` only. It is
 * also the quirk the fetching version spent most of its length working
 * around — it sent a legacy Firefox User-Agent so the CSS2 API would
 * hand back a format Satori could read.
 *
 * The files are full faces rather than the per-render subsets Google
 * returned for `&text=`. They are ~23 kB each and read from local
 * disk, so this is still much faster than the two round-trips it
 * replaces, and the result is identical for any text.
 */

/**
 * Satori-readable faces, keyed by the weight the routes ask for.
 *
 * Add an entry when an OG route needs a new weight, and drop the
 * matching file in `src/fonts` — a weight with no entry throws at
 * render rather than silently falling back to a face that isn't
 * Outfit.
 */
const OG_FONT_FILES: Record<number, string> = {
  600: "outfit-600.woff",
  900: "outfit-900.woff",
};

/**
 * `process.cwd()` is the project root in both `next dev` and the
 * Vercel runtime. These files are read at request time, so they have
 * to be traced into the function bundle — see
 * `outputFileTracingIncludes` in `next.config.ts`, without which this
 * throws ENOENT in production while working perfectly in dev.
 */
const FONT_DIR = join(process.cwd(), "src", "fonts");

const cache = new Map<number, Promise<Buffer>>();

/**
 * Load a display face for an OG image.
 *
 * `family` is accepted so call sites still read as they did, but only
 * Outfit is shipped — passing anything else is a mistake worth
 * failing on rather than quietly rendering in a fallback nobody
 * chose.
 */
export async function loadOgFont(
  family: string,
  weight: number,
): Promise<ArrayBuffer> {
  if (family !== "Outfit") {
    throw new Error(
      `og font: only Outfit is self-hosted for OG images, asked for "${family}". `
        + `Add the face to src/fonts and OG_FONT_FILES first.`,
    );
  }

  const file = OG_FONT_FILES[weight];
  if (!file) {
    throw new Error(
      `og font: no Outfit face for weight ${weight}. `
        + `Available: ${Object.keys(OG_FONT_FILES).join(", ")}.`,
    );
  }

  // Cached per weight for the life of the process — a warm function
  // serving a burst of shares reads each face once.
  let pending = cache.get(weight);
  if (!pending) {
    pending = readFile(join(FONT_DIR, file));
    cache.set(weight, pending);
  }

  const buf = await pending;
  // Copy out of the pooled Node Buffer: `buf.buffer` is a slab shared
  // with unrelated allocations, so handing it to Satori whole would
  // give it far more bytes than the font.
  return buf.buffer.slice(
    buf.byteOffset,
    buf.byteOffset + buf.byteLength,
  ) as ArrayBuffer;
}
