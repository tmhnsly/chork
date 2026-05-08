import type { Metadata, Viewport } from "next";
import { Outfit, Inter, Archivo } from "next/font/google";
import { Providers } from "./providers";
import { NavBarShell } from "@/components/NavBar/NavBarShell";
import { env } from "@/lib/env";
import "@/styles/globals.scss";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
  preload: false,
});

// Real italic for display surfaces. Outfit ships no italic on Google
// Fonts, so every `font-style: italic` on the heading family was being
// browser-synthesised by skewing the upright glyph — synth-italic
// glyphs overhang their advance-width box, which iOS Safari paints
// outside the layout box and then clips. A real italic font reports
// correct advance widths, so the right edge no longer shaves off.
//
// Archivo: neutral grotesque, weight up to 900, has a real italic
// axis. Picked after a side-by-side trial across DM Sans, Hanken
// Grotesk, Plus Jakarta, Mona/Hubot, Public Sans — Archivo holds
// the most consistent character against Outfit Black upright while
// keeping the grid-numbers (01 / 02 / 03 / 04) readable.
const archivoItalic = Archivo({
  subsets: ["latin"],
  weight: ["700", "800", "900"],
  style: ["italic"],
  variable: "--font-display-italic",
  display: "swap",
});

// Public site URL for absolute share-link image / canonical resolution.
// Validated + typed via `@/lib/env`; missing env var fails the build
// in production rather than silently shipping a stale fallback.
const SITE_URL = env.SITE_URL;

const APP_DESCRIPTION =
  "Competition tracker for climbing gyms. Log every send on numbered routes in your gym's active set, climb the Chorkboard, and compete with crews.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Chork · Competition tracker for climbing gyms",
    template: "%s · Chork",
  },
  description: APP_DESCRIPTION,
  applicationName: "Chork",
  keywords: [
    "bouldering",
    "climbing",
    "leaderboard",
    "climbing gym",
    "competition",
    "PWA",
    "send tracker",
  ],
  authors: [{ name: "Chork" }],
  creator: "Chork",
  publisher: "Chork",
  manifest: "/manifest.json",
  // Icon strategy:
  //   1. /icon.svg is the primary favicon. It carries an internal
  //      `@media (prefers-color-scheme: dark)` rule that swaps the
  //      glyph stroke colour — so the one file is correct in both
  //      light AND dark OS themes, reactively, with no help from
  //      the server. All evergreen browsers (Firefox 88+, Chrome
  //      108+, Safari 16+, Edge Chromium) honour the media query
  //      inside the SVG and re-paint when the user flips their
  //      system theme.
  //   2. /favicon.ico is the bulletproof fallback for browsers that
  //      don't render SVG favicons — rendered in the lime brand
  //      variant, which is high-contrast against both light and
  //      dark chrome so one file serves both modes.
  //
  // Listed in this order because browsers walk the list and take
  // the first entry they can handle. Media-queried PNG variants
  // were dropped because (a) they never actually worked in Firefox
  // — Gecko ignores `media` on <link rel="icon"> — and (b) the SVG
  // path above renders perfectly in every browser we support.
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "any" },
    ],
    // Pinned to the dark variant — dark plate + pale mark + lime
    // dot — regardless of OS theme. Brand-consistent PWA icon; we
    // don't want the lime-plate "light" design appearing on home
    // screens for users who install while in light mode.
    apple: [{ url: "/apple-touch-icon-dark.png" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Chork",
    // iOS shows the splash image while the PWA boots — without these
    // it shows a white blank from launch until first paint. Image is
    // a centred icon on the manifest's #111210 background. Only a
    // handful of sizes — iOS scales the closest match. Without media
    // queries iOS picks any.
    startupImage: [
      "/apple-splash-2048-2732.png",
      "/apple-splash-1290-2796.png",
      "/apple-splash-1170-2532.png",
      "/apple-splash-750-1334.png",
    ],
  },
  // OpenGraph for Facebook / LinkedIn / iMessage / Slack / Discord etc.
  // Hero image is generated dynamically by `src/app/opengraph-image.tsx`
  // — Next's file-based convention auto-injects the <meta og:image> tag,
  // so no manual `images` entry is needed (and listing one here would
  // override the generated route).
  openGraph: {
    type: "website",
    siteName: "Chork",
    title: "Chork · Bouldering competition tracker for gyms & crews",
    description: APP_DESCRIPTION,
    url: SITE_URL,
    locale: "en_GB",
  },
  // Twitter / X cards. `summary_large_image` is driven by
  // `src/app/twitter-image.tsx` (which re-exports the OG route) so the
  // same hero renders on both platforms.
  twitter: {
    card: "summary_large_image",
    title: "Chork · Bouldering competition tracker for gyms & crews",
    description: APP_DESCRIPTION,
  },
  // Search-engine hints. robots auto-derives sensible defaults; tighten
  // here only if a future page needs noindex (handled per-page via its
  // own `metadata` export, not here).
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  // Canonical for the root. Per-page metadata exports add their own
  // canonicals as needed.
  alternates: {
    canonical: "/",
  },
  // Format detection: don't auto-link plain text that looks like a
  // phone number / email / address inside the app. Otherwise iOS will
  // try to format climber stats as phone numbers (yes, really).
  formatDetection: {
    telephone: false,
    email: false,
    address: false,
  },
};

export const viewport: Viewport = {
  themeColor: "#bdee63",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // NOTE: deliberately NOT setting maximumScale or userScalable=false.
  // Both block pinch-zoom which is a WCAG-blocker for low-vision
  // users (lighthouse a11y → meta-viewport audit fails). The
  // iOS-Safari-zooms-on-input-focus problem is solved by every text
  // input rendering at ≥16px (see input typography preset). If an
  // input ever drops below 16px during a transition, fix it at the
  // typography layer rather than locking the viewport.
};

/**
 * Root layout renders synchronously — no server-side profile fetch.
 *
 * We used to await `getServerProfile()` here so the navbar painted in
 * its logged-in state on the very first HTML byte. That added two
 * Supabase round-trips to the critical path of every cold page load
 * (auth.getUser + profiles select), showing a white screen for
 * 400-600ms before any paint.
 *
 * Trade-off accepted: the AuthProvider's two-phase bootstrap
 * (localStorage session read → server JWT validation) fills the
 * navbar ~50-100ms after hydration. NavBar handles the transient
 * loading state by rendering its brand-only variant until the
 * profile resolves — no logged-out-nav flash, just a brief
 * minimal-nav flash, which is a much better perceived perf trade.
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${outfit.variable} ${inter.variable} ${archivoItalic.variable}`}
    >
      <body>
        <a href="#main-content" className="skip-link">Skip to main content</a>
        {/* NavBar is rendered server-side (reads the auth-shell cookie)
            and threaded into the client Providers tree as a prop — a
            server component can't be imported inside a "use client"
            file, so composition via children avoids the boundary
            violation while still letting the server shell pick the
            correct nav variant before hydration. */}
        <Providers navBar={<NavBarShell />}>{children}</Providers>
      </body>
    </html>
  );
}
