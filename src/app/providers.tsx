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
      <PaletteProvider>
      <AuthProvider>
        <ScrollRestore />
        <OfflineBanner />
        <NavBar />
        <div id="main-content">{children}</div>
        <ToastProvider />
        <ServiceWorker />
      </AuthProvider>
      </PaletteProvider>
    </ThemeProvider>
  );
}
