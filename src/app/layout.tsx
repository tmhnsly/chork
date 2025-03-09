import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Theme } from "@radix-ui/themes";
import { ThemeProvider } from "next-themes";
import "./globals.css";
import "@radix-ui/themes/styles.css";
import { Toaster } from "@/components/Toaster/Toaster";
import { MainNav } from "@/components/MainNav/MainNav";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Chork",
  description: "Let's get chalky",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <ThemeProvider attribute="class">
          <Theme radius="full">
            <MainNav />
            {children}
            <Toaster />
          </Theme>
        </ThemeProvider>
      </body>
    </html>
  );
}
