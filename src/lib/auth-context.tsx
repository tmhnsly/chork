"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { useRouter, usePathname } from "next/navigation";
import { getClientPB, getAuthUser } from "./pocketbase";
import { formatPBError } from "./pb-error";
import { showToast } from "@/components/ui";
import type { UsersResponse } from "./pocketbase-types";

export function isOnboarded(user: UsersResponse): boolean {
  return (user as Record<string, unknown>).onboarded === true;
}

interface AuthContextValue {
  user: UsersResponse | null;
  isLoading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => void;
  refreshUser: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UsersResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();
  const pb = getClientPB();

  useEffect(() => {
    setUser(getAuthUser(pb));
    setIsLoading(false);
  }, [pb]);

  useEffect(() => {
    if (isLoading) return;
    if (user && !isOnboarded(user) && pathname !== "/onboarding") {
      router.replace("/onboarding");
    }
  }, [user, isLoading, pathname, router]);

  const refreshUser = useCallback(() => {
    pb.authStore.loadFromCookie(document.cookie);
    setUser(getAuthUser(pb));
  }, [pb]);

  const signInWithGoogle = useCallback(async () => {
    setIsLoading(true);

    try {
      const result = await pb
        .collection("users")
        .authWithOAuth2({ provider: "google" });

      const record = result.record as UsersResponse;
      setUser(record);

      if (result.meta?.isNew || !isOnboarded(record)) {
        router.push("/onboarding");
      } else {
        showToast(`Signed in as @${record.username}`);
        // Hard navigate to bypass the client router cache — the server
        // component on "/" branches on cookies, so a full reload is
        // needed to pick up the freshly-set auth cookie reliably.
        window.location.href = "/";
      }
    } catch (err) {
      showToast(formatPBError(err), "error");
    } finally {
      setIsLoading(false);
    }
  }, [pb, router]);

  const signOut = useCallback(() => {
    pb.authStore.clear();
    setUser(null);
    showToast("Signed out", "info");
    // Hard navigate — same reason as sign-in: the server component
    // must re-read cookies to switch between authed/unauthed views.
    window.location.href = "/";
  }, [pb]);

  return (
    <AuthContext.Provider
      value={{ user, isLoading, signInWithGoogle, signOut, refreshUser }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
