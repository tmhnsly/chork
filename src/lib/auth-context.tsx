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

/**
 * Local cache of the climber's profile. Lets the bootstrap skip the
 * Supabase profile-fetch round-trip on warm cache — NavBar paints in
 * its full state immediately instead of brand-only-then-personalised.
 *
 * Stamped with a version + an `id` so a sign-out / different-user
 * load doesn't show stale data. TTL is short (1h) so a profile rename
 * on another device shows up reasonably quickly even without an
 * intervening server validate.
 */
const PROFILE_CACHE_KEY = "chork-profile-cache-v1";
const PROFILE_CACHE_TTL_MS = 60 * 60 * 1000; // 1h

interface ProfileCacheEntry {
  profile: Profile;
  cachedAt: number;
}

function readProfileCache(): ProfileCacheEntry | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PROFILE_CACHE_KEY);
    if (!raw) return null;
    const entry = JSON.parse(raw) as ProfileCacheEntry;
    if (!entry?.profile?.id) return null;
    if (Date.now() - entry.cachedAt > PROFILE_CACHE_TTL_MS) return null;
    return entry;
  } catch {
    return null;
  }
}

function writeProfileCache(profile: Profile | null): void {
  if (typeof window === "undefined") return;
  try {
    if (!profile) {
      window.localStorage.removeItem(PROFILE_CACHE_KEY);
      return;
    }
    const entry: ProfileCacheEntry = { profile, cachedAt: Date.now() };
    window.localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(entry));
  } catch {
    // localStorage can throw under quota / private mode — silently
    // skip; bootstrap falls back to the network path.
  }
}

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
  // Lazy initial state pulls a recent profile cache from localStorage
  // synchronously on mount. If we hit, NavBar paints in its
  // logged-in state on the very first hydration cycle — no
  // brand-only-then-personalised flash. The three-phase bootstrap
  // below validates the cache against Supabase in the background.
  const [profile, setProfile] = useState<Profile | null>(() => {
    return readProfileCache()?.profile ?? null;
  });
  const [isLoading, setIsLoading] = useState(() => {
    // If we have a cached profile, we're not "loading" from the
    // user's perspective — the UI is already populated. Background
    // validation refines it but doesn't gate render.
    return readProfileCache() === null;
  });
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

  // Persist the canonical profile on every change so the next cold
  // open can fast-path. Clears on sign-out (profile=null).
  useEffect(() => {
    writeProfileCache(profile);
  }, [profile]);

  // Bootstrap: two-phase auth check.
  // Phase 1: getSession() reads from local storage — instant, no network.
  //          Sets profile only if it changed vs the cached version.
  // Phase 2: getUser() validates with the server — catches expired tokens.
  //          If the session was invalid, clears the profile.
  useEffect(() => {
    let initialCheckDone = false;

    async function bootstrap() {
      // Phase 1 — instant local session
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const fresh = await fetchProfile(session.user.id);
        // Avoid re-render churn when the cached profile already
        // matched — equality by id + updated_at is enough.
        if (
          fresh &&
          (!profileRef.current ||
            profileRef.current.id !== fresh.id ||
            profileRef.current.updated_at !== fresh.updated_at)
        ) {
          setProfile(fresh);
        }
      } else if (profileRef.current) {
        // Cache was stale (signed out elsewhere) — clear.
        setProfile(null);
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
    // Prefer the configured site URL over `window.location.origin` —
    // the latter resolves to `http://localhost:3000` during local
    // development, so the password-reset email would point a user
    // at their machine. Fall back to the window origin only when the
    // env isn't set (e.g. storybook, tests).
    const base = process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin;
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${base}/auth/callback?next=/login`,
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
