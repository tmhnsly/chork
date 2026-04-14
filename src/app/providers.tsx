"use client";

import { ThemeProvider } from "next-themes";
import { ThemeProvider as PaletteProvider } from "@/lib/theme";
import { AuthProvider } from "@/lib/auth-context";
import { NavBar } from "@/components/NavBar/NavBar";
import { OfflineBanner } from "@/components/OfflineBanner/OfflineBanner";
import { ScrollRestore } from "@/components/ScrollRestore/ScrollRestore";
import { ServiceWorker } from "@/components/ServiceWorker";
import { ToastProvider } from "@/components/ui";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <AuthProvider>
        {/* PaletteProvider sits inside AuthProvider so it can read
            the climber's persisted theme from the profile and bridge
            it into the local store on first auth resolve. */}
        <PaletteProvider>
          <ScrollRestore />
          <OfflineBanner />
          <NavBar />
          <div id="main-content">{children}</div>
          <ToastProvider />
          <ServiceWorker />
        </PaletteProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
