"use client";

import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/lib/auth-context";
import { NavBar } from "@/components/NavBar/NavBar";
import { ToastProvider } from "@/components/ui";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <AuthProvider>
        <NavBar />
        {children}
        <ToastProvider />
      </AuthProvider>
    </ThemeProvider>
  );
}
