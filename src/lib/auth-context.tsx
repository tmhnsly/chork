"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "./supabase/client";
import { showToast } from "@/components/ui";
import type { Profile } from "./data/types";

interface AuthContextValue {
  profile: Profile | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  // Start in the "loading" state. The two-phase bootstrap below reads
  // the session from localStorage (instant, no network) and populates
  // profile ~50-100ms after hydration. NavBar's isLoading branch
  // renders a brand-only nav during this window — much better trade
  // than blocking the root layout on a Supabase round-trip to avoid
  // that tiny flash.
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const profileRef = useRef(profile);
  useEffect(() => { profileRef.current = profile; }, [profile]);
  const routerRef = useRef(router);
  useEffect(() => { routerRef.current = router; }, [router]);

  const fetchProfile = useCallback(async (userId: string): Promise<Profile | null> => {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();
    if (error) {
      console.warn("[chork] fetchProfile failed:", error);
    }
    return data;
  }, [supabase]);

  // Bootstrap: two-phase auth check.
  // Phase 1: getSession() reads from local storage — instant, no network.
  //          Sets profile immediately so PWA resumes without a flash.
  // Phase 2: getUser() validates with the server — catches expired tokens.
  //          If the session was invalid, clears the profile.
  useEffect(() => {
    let initialCheckDone = false;

    async function bootstrap() {
      // Phase 1 — instant local session
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const p = await fetchProfile(session.user.id);
        setProfile(p);
      }
      setIsLoading(false);

      // Phase 2 — server validation (catches expired/revoked tokens)
      const { data: { user } } = await supabase.auth.getUser();
      if (!user && session?.user) {
        // Session was stale — clear it
        setProfile(null);
      } else if (user && !profileRef.current) {
        // Edge case: getSession had no session but getUser found one
        const p = await fetchProfile(user.id);
        setProfile(p);
      }

      initialCheckDone = true;
    }

    bootstrap();

    // Listen for auth changes after bootstrap completes.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!initialCheckDone) return;

        if (event === "SIGNED_IN" && session?.user) {
          const p = await fetchProfile(session.user.id);
          setProfile(p);
          routerRef.current.refresh();
        } else if (event === "TOKEN_REFRESHED" && session?.user) {
          if (!profileRef.current) {
            const p = await fetchProfile(session.user.id);
            setProfile(p);
          }
        } else if (event === "SIGNED_OUT") {
          setProfile(null);
          routerRef.current.refresh();
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [supabase, fetchProfile]);

  // Onboarding redirect is handled by middleware server-side.
  // No client-side redirect needed — avoids double-redirect issues.

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      showToast(error.message, "error");
      return;
    }
    // Hard navigation ensures middleware runs with fresh session cookies.
    // router.push + refresh doesn't reliably bust the RSC cache.
    window.location.href = "/";
  }, [supabase]);

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
    showToast("Account created - check your email to confirm");
  }, [supabase]);

  const resetPassword = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/login`,
    });
    if (error) {
      showToast(error.message, "error");
      return;
    }
    showToast("Check your email for a password reset link");
  }, [supabase]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
    showToast("Signed out", "info");
    // Hard navigation — same as signIn. router.push + refresh
    // doesn't reliably bust the RSC cache or update middleware state.
    window.location.href = "/";
  }, [supabase]);

  const refreshProfile = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const p = await fetchProfile(user.id);
      setProfile(p);
    }
  }, [supabase, fetchProfile]);

  const value = useMemo(
    () => ({ profile, isLoading, signIn, signUp, signOut, resetPassword, refreshProfile }),
    [profile, isLoading, signIn, signUp, signOut, resetPassword, refreshProfile]
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
