import type { Metadata, Viewport } from "next";
import { Outfit, Inter } from "next/font/google";
import { Providers } from "./providers";
import { NavBarShell } from "@/components/NavBar/NavBarShell";
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

// Public site URL for absolute share-link image / canonical resolution.
// Set NEXT_PUBLIC_SITE_URL in env (Vercel project setting) — fallback
// is the current Vercel preview domain. When chork.app is provisioned,
// flip the env var; the fallback stays as the deploy domain so
// previews always resolve.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://chork.vercel.app";

const APP_DESCRIPTION =
  "Bouldering competition tracker for gyms. Log every send on numbered routes in your gym's active set, climb the public Chorkboard, and compete with crews.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Chork — Bouldering competition tracker",
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
    // iOS 16.4+ respects `media` on apple-touch-icon: the system
    // picks the matching variant at PWA install time. Post-install
    // theme flips don't update the home-screen icon — iOS caches
    // whatever it chose on install — which is an iOS limitation we
    // can't work around. But a user installing while in dark mode
    // gets the dark icon, and vice versa, which is what the user
    // actually sees day-to-day.
    //
    // File naming: `-light` is the design FOR light mode (lime
    // plate, dark mark). `-dark` is the design FOR dark mode
    // (dark plate, pale mark + lime dot). Same convention as the
    // rest of the icon set — target OS theme, not graphic colour.
    apple: [
      { url: "/apple-touch-icon-light.png", media: "(prefers-color-scheme: light)" },
      { url: "/apple-touch-icon-dark.png", media: "(prefers-color-scheme: dark)" },
    ],
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
  openGraph: {
    type: "website",
    siteName: "Chork",
    title: "Chork — Bouldering competition tracker",
    description: APP_DESCRIPTION,
    url: SITE_URL,
    locale: "en_GB",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Chork — Send it. Log it. Prove it.",
        type: "image/png",
      },
    ],
  },
  // Twitter / X cards. summary_large_image gives the full 1200×630 hero
  // — the same OG image is reused since the platforms render identically.
  twitter: {
    card: "summary_large_image",
    title: "Chork — Bouldering competition tracker",
    description: APP_DESCRIPTION,
    images: ["/og-image.png"],
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
      className={`${outfit.variable} ${inter.variable}`}
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
