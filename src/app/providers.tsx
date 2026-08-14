"use client";

import type { ReactNode } from "react";
import { ThemeProvider } from "next-themes";
import { ThemeProvider as PaletteProvider } from "@/lib/theme";
import { AuthProvider } from "@/lib/auth-context";
import { OfflineBanner } from "@/components/OfflineBanner/OfflineBanner";
import { ScrollRestore } from "@/components/ScrollRestore/ScrollRestore";
import { ServiceWorker } from "@/components/ServiceWorker";
import { ToastProvider } from "@/components/ui";

interface Props {
  children: ReactNode;
  /**
   * Pre-rendered server NavBar (`<NavBarShell />`). Passed in as a
   * prop instead of imported here so a server component (which
   * cannot be imported into a "use client" module) can still be
   * embedded in the provider tree — composition via children, not
   * module imports.
   */
  navBar: ReactNode;
}

export function Providers({ children, navBar }: Props) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <AuthProvider>
        {/* PaletteProvider sits inside AuthProvider so it can read
            the climber's persisted theme from the profile and bridge
            it into the local store on first auth resolve. */}
        <PaletteProvider>
          <ScrollRestore />
          <OfflineBanner />
          {navBar}
          {/* tabIndex={-1} is what makes the skip link work: browsers
              scroll to a bare div but won't move focus into it, so the
              next Tab returned to the nav and the link was decorative. */}
          <div id="main-content" tabIndex={-1}>{children}</div>
          <ToastProvider />
          <ServiceWorker />
        </PaletteProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
