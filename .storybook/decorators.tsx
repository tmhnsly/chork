import React, { createContext, useContext } from "react";
import type { UsersResponse } from "../src/lib/pocketbase-types";
import { ToastProvider } from "../src/components/ui/Toast";

/**
 * Storybook mock for @/lib/auth-context.
 *
 * Aliased via webpack in .storybook/main.ts so that any component
 * importing { useAuth } from "@/lib/auth-context" gets this mock
 * instead of the real one (which depends on next/navigation).
 */

interface AuthContextValue {
  user: UsersResponse | null;
  isLoading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => void;
  refreshUser: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  isLoading: false,
  signInWithGoogle: async () => {},
  signOut: () => {},
  refreshUser: () => {},
});

export function isOnboarded(user: UsersResponse): boolean {
  return (user as Record<string, unknown>).onboarded === true;
}

export function AuthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthContext.Provider
      value={{
        user: null,
        isLoading: false,
        signInWithGoogle: async () => {},
        signOut: () => {},
        refreshUser: () => {},
      }}
    >
      {children}
      <ToastProvider />
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
