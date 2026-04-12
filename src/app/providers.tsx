"use client";

import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/lib/auth-context";
import { NavBar } from "@/components/NavBar/NavBar";
import { OfflineBanner } from "@/components/OfflineBanner/OfflineBanner";
import { ServiceWorker } from "@/components/ServiceWorker";
import { ToastProvider } from "@/components/ui";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <AuthProvider>
        <OfflineBanner />
        <NavBar />
        <div id="main-content">{children}</div>
        <ToastProvider />
        <ServiceWorker />
      </AuthProvider>
    </ThemeProvider>
  );
}
