// Regenerate public/og-image.png — Open Graph / Twitter card art.
//
// Run with: `pnpm exec node scripts/og-render.mjs`
//
// Renders scripts/og-render.html via Playwright, driving the system
// Chrome install (channel: 'chrome') so we don't pull the
// chromium-headless-shell cache for a one-off OG render. Playwright
// is a devDependency so nothing here reaches the production bundle.
// Output: downsampled 2× capture → crisp 1200×630 PNG.
import { chromium } from "playwright";
import sharp from "sharp";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const htmlPath = resolve(__dirname, "og-render.html");
const outPath = process.argv[2] || resolve(__dirname, "..", "public/og-image.png");

const browser = await chromium.launch({ channel: "chrome" });
const ctx = await browser.newContext({
  viewport: { width: 1200, height: 630 },
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();
await page.goto("file://" + htmlPath, { waitUntil: "networkidle" });
await page.evaluate(async () => {
  await document.fonts.ready;
});
await page.waitForTimeout(300);
const buf = await page.screenshot({
  clip: { x: 0, y: 0, width: 1200, height: 630 },
  omitBackground: false,
});
await browser.close();

await sharp(buf)
  .resize(1200, 630, { fit: "fill", kernel: "lanczos3" })
  .png({ compressionLevel: 9 })
  .toFile(outPath);

console.log("wrote", outPath);
