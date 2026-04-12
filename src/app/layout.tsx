import type { Metadata, Viewport } from "next";
import { Outfit, Inter } from "next/font/google";
import { Providers } from "./providers";
import { getServerProfile } from "@/lib/supabase/server";
import type { Profile } from "@/lib/data/types";
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
  icons: {
    icon: "/icon.svg",
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
  // The primary fix is ensuring every text input is ≥16px (see input
  // typography rules), but locking the scale is a belt-and-braces
  // guard for inputs that momentarily render smaller during transition.
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

// Read the user's profile server-side so the navbar renders the correct
// auth state on the FIRST paint. Deduped against page.tsx and any auth
// helper via the React-cache-wrapped `getServerProfile` so a single
// request only hits auth + profiles once total.
async function getInitialProfile(): Promise<Profile | null> {
  try {
    return await getServerProfile();
  } catch {
    return null;
  }
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const initialProfile = await getInitialProfile();

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${outfit.variable} ${inter.variable}`}
    >
      <body>
        <a href="#main-content" className="skip-link">Skip to main content</a>
        <Providers initialProfile={initialProfile}>{children}</Providers>
      </body>
    </html>
  );
}
