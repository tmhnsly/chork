"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
import { useRouter, usePathname } from "next/navigation";
import { createBrowserSupabase } from "./supabase/client";
import { showToast } from "@/components/ui";
import type { Profile } from "./data/types";

interface AuthContextValue {
  profile: Profile | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();
  const supabase = useMemo(() => createBrowserSupabase(), []);

  // Fetch the profile for the current auth user
  const fetchProfile = useCallback(async (userId: string): Promise<Profile | null> => {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();
    return data;
  }, [supabase]);

  // Load profile on mount and listen for auth changes
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (session?.user) {
          const p = await fetchProfile(session.user.id);
          setProfile(p);
        } else {
          setProfile(null);
        }
        setIsLoading(false);

        // Refresh server components on auth change
        if (event === "SIGNED_IN" || event === "SIGNED_OUT") {
          router.refresh();
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [supabase, fetchProfile, router]);

  // Redirect non-onboarded users
  useEffect(() => {
    if (isLoading) return;
    if (profile && !profile.onboarded && pathname !== "/onboarding") {
      router.replace("/onboarding");
    }
  }, [profile, isLoading, pathname, router]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      showToast(error.message, "error");
      return;
    }
    router.push("/");
  }, [supabase, router]);

  const signUp = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/onboarding`,
      },
    });
    if (error) {
      showToast(error.message, "error");
      return;
    }
    showToast("Account created — check your email to confirm");
  }, [supabase]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
    showToast("Signed out", "info");
    router.push("/");
  }, [supabase, router]);

  const refreshProfile = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const p = await fetchProfile(user.id);
      setProfile(p);
    }
  }, [supabase, fetchProfile]);

  const value = useMemo(
    () => ({ profile, isLoading, signIn, signUp, signOut, refreshProfile }),
    [profile, isLoading, signIn, signUp, signOut, refreshProfile]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
