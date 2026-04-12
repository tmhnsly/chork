"use client";

import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/lib/auth-context";
import { NavBar } from "@/components/NavBar/NavBar";
import { OfflineBanner } from "@/components/OfflineBanner/OfflineBanner";
import { ServiceWorker } from "@/components/ServiceWorker";
import { ToastProvider } from "@/components/ui";
import type { Profile } from "@/lib/data/types";

export function Providers({
  children,
  initialProfile,
}: {
  children: React.ReactNode;
  initialProfile: Profile | null;
}) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <AuthProvider initialProfile={initialProfile}>
        <OfflineBanner />
        <NavBar />
        <div id="main-content">{children}</div>
        <ToastProvider />
        <ServiceWorker />
      </AuthProvider>
    </ThemeProvider>
  );
}
