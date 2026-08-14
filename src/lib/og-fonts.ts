/**
 * Google Font loader for `next/og` (Satori) image routes.
 *
 * Shared by every `opengraph-image` in the app. Two Google-Fonts
 * quirks are handled here so each route doesn't rediscover them:
 *
 *  1. The CSS2 API picks the font format from the User-Agent. With no
 *     UA (or a modern one) it returns `.woff2`, which Satori cannot
 *     parse. A legacy Firefox UA forces a format Satori CAN read —
 *     historically `.ttf`, today usually `.woff`.
 *
 *  2. Outfit (the brand display family) ships upright weights only.
 *     Requesting `ital,wght@1,…` returns HTTP 400 "Font family not
 *     found", so only ever request upright; faux-italic is done with
 *     `transform: skewX(...)` in the JSX.
 *
 * Pass the exact glyphs you render as `text` — Google returns a
 * subsetted face, which keeps each request at ~2–3 kB so the image
 * builds fast even on a cold invocation.
 */
export async function loadGoogleFont(
  family: string,
  weight: number,
  text: string,
): Promise<ArrayBuffer> {
  const spec = `${family}:wght@${weight}`;
  const css = await (
    await fetch(
      `https://fonts.googleapis.com/css2?family=${encodeURIComponent(
        spec,
      )}&text=${encodeURIComponent(text)}`,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:10.0) Gecko/20100101 Firefox/10.0",
        },
      },
    )
  ).text();
  const match = css.match(
    /src:\s*url\((.+?)\)\s*format\('(?:opentype|truetype|woff)'\)/,
  );
  if (!match) {
    throw new Error(
      `font fetch failed: ${family} ${weight} — no matching @font-face src in response`,
    );
  }
  const res = await fetch(match[1]);
  return res.arrayBuffer();
}
