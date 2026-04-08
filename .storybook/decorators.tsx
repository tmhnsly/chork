import React, { createContext, useContext } from "react";
import type { Profile } from "../src/lib/data/types";
import { ToastProvider } from "../src/components/ui/Toast";

/**
 * Storybook mock for @/lib/auth-context.
 *
 * Aliased via webpack in .storybook/main.ts so that any component
 * importing { useAuth } from "@/lib/auth-context" gets this mock
 * instead of the real one (which depends on next/navigation).
 */

interface AuthContextValue {
  profile: Profile | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  profile: null,
  isLoading: false,
  signIn: async () => {},
  signUp: async () => {},
  signOut: async () => {},
  refreshProfile: async () => {},
});

export function AuthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthContext.Provider
      value={{
        profile: null,
        isLoading: false,
        signIn: async () => {},
        signUp: async () => {},
        signOut: async () => {},
        refreshProfile: async () => {},
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
