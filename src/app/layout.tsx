import type { Metadata, Viewport } from "next";
import { Outfit, Inter } from "next/font/google";
import { Providers } from "./providers";
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
  // Explicit PNG icons in `/public` — each size gets its own entry so
  // browsers + iOS pick the right bitmap without downscaling SVG.
  // Dark/light variants let the OS match the user's colour scheme
  // (HTML `<link rel="icon">` properly respects the `media` hint;
  // the manifest's `media` extension is non-standard and most installers
  // ignore it — the manifest now ships single neutral entries).
  icons: {
    icon: [
      { url: "/icon-favicon-16-light.png", sizes: "16x16", type: "image/png", media: "(prefers-color-scheme: dark)" },
      { url: "/icon-favicon-16-dark.png",  sizes: "16x16", type: "image/png", media: "(prefers-color-scheme: light)" },
      { url: "/icon-favicon-32-light.png", sizes: "32x32", type: "image/png", media: "(prefers-color-scheme: dark)" },
      { url: "/icon-favicon-32-dark.png",  sizes: "32x32", type: "image/png", media: "(prefers-color-scheme: light)" },
      { url: "/icon-favicon-48-light.png", sizes: "48x48", type: "image/png", media: "(prefers-color-scheme: dark)" },
      { url: "/icon-favicon-48-dark.png",  sizes: "48x48", type: "image/png", media: "(prefers-color-scheme: light)" },
    ],
    apple: [
      { url: "/icon-apple-touch-icon-light.png", media: "(prefers-color-scheme: dark)" },
      { url: "/icon-apple-touch-icon-dark.png",  media: "(prefers-color-scheme: light)" },
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
  // Prevent iOS Safari from zooming the viewport on input focus.
  // Primary fix is ≥16px on every text input (see input typography),
  // the scale lock is belt-and-braces for inputs that momentarily
  // render smaller during transitions.
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
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
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
