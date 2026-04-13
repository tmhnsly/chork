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

export const metadata: Metadata = {
  title: "Chork",
  description: "Bouldering comp tracker - send it, log it, prove it.",
  manifest: "/manifest.json",
  // Explicit PNG icons in `/public` — each size gets its own entry so
  // browsers + iOS pick the right bitmap without downscaling SVG.
  // Dark/light variants let the OS match the user's colour scheme
  // (PWA installer + Safari respect the `media` hint).
  icons: {
    icon: [
      { url: "/icon-favicon-16-dark.png", sizes: "16x16", type: "image/png", media: "(prefers-color-scheme: dark)" },
      { url: "/icon-favicon-16-light.png", sizes: "16x16", type: "image/png", media: "(prefers-color-scheme: light)" },
      { url: "/icon-favicon-32-dark.png", sizes: "32x32", type: "image/png", media: "(prefers-color-scheme: dark)" },
      { url: "/icon-favicon-32-light.png", sizes: "32x32", type: "image/png", media: "(prefers-color-scheme: light)" },
      { url: "/icon-favicon-48-dark.png", sizes: "48x48", type: "image/png", media: "(prefers-color-scheme: dark)" },
      { url: "/icon-favicon-48-light.png", sizes: "48x48", type: "image/png", media: "(prefers-color-scheme: light)" },
    ],
    apple: [
      { url: "/icon-apple-touch-icon-dark.png", media: "(prefers-color-scheme: dark)" },
      { url: "/icon-apple-touch-icon-light.png", media: "(prefers-color-scheme: light)" },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Chork",
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
