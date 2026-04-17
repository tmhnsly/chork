"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "./supabase/client";
import { showToast } from "@/components/ui";
import { signOutAction } from "@/app/login/actions";
import { DEFAULT_THEME, setThemeStore } from "./theme-store";
import { mutationQueue } from "./offline/mutation-queue";
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
// Bumped to v2 when isAdmin was added to the cached payload. Old v1
// entries are silently ignored (cache miss → standard bootstrap).
const PROFILE_CACHE_KEY = "chork-profile-cache-v2";
const PROFILE_CACHE_TTL_MS = 60 * 60 * 1000; // 1h

interface ProfileCacheEntry {
  profile: Profile;
  /**
   * Cached admin flag — true when the user has at least one
   * gym_admins row. Drives the conditional Admin tab in NavBar.
   * Re-fetched alongside the profile during background validation.
   */
  isAdmin: boolean;
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

function writeProfileCache(profile: Profile | null, isAdmin: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (!profile) {
      window.localStorage.removeItem(PROFILE_CACHE_KEY);
    } else {
      const entry: ProfileCacheEntry = { profile, isAdmin, cachedAt: Date.now() };
      window.localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(entry));
    }
  } catch {
    // localStorage can throw under quota / private mode — silently
    // skip; bootstrap falls back to the network path.
  }
  // Cross-tab sync: notify in-tab subscribers (useSyncExternalStore's
  // `subscribe` listens to this event). The native `storage` event
  // fires for OTHER tabs only, not the one that wrote, so a
  // hand-rolled event covers the same-tab case.
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("chork-profile-cache"));
  }
}

// ── External store bridge for the localStorage cache ─────
// Using `useSyncExternalStore` keeps SSR + client-initial render
// identical (both see `null` via `getServerSnapshot`) while post-
// mount client renders see the cached entry via `getSnapshot`.
// No setState-in-effect required to hydrate from localStorage.

function subscribeToProfileCache(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", callback);
  window.addEventListener("chork-profile-cache", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("chork-profile-cache", callback);
  };
}

// `useSyncExternalStore` expects reference equality for no-op ticks.
// Memoise the parsed result per raw string so a re-read of the same
// storage value returns the same object reference.
let cachedRaw: string | null = null;
let cachedEntry: ProfileCacheEntry | null = null;
function getProfileCacheSnapshot(): ProfileCacheEntry | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PROFILE_CACHE_KEY);
    if (raw === cachedRaw) return cachedEntry;
    cachedRaw = raw;
    cachedEntry = raw ? readProfileCache() : null;
    return cachedEntry;
  } catch {
    return null;
  }
}

function getProfileCacheServerSnapshot(): null {
  return null;
}

interface AuthContextValue {
  profile: Profile | null;
  /**
   * True when the climber is an admin / owner of at least one gym.
   * Drives the Admin tab in NavBar. Sourced from `gym_admins`, NOT
   * the cosmetic `gym_memberships.role` column.
   */
  isAdmin: boolean;
  isLoading: boolean;
  // signIn / signUp previously lived here but had a cookie race
  // (browser auth call + window.location.href). They're now server
  // actions — `signInAction` / `signUpAction` in
  // src/app/login/actions.ts — invoked directly from login-form.tsx
  // via useActionState. Nothing on the context so nobody accidentally
  // reaches for the racy version.
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  // Cache snapshot via `useSyncExternalStore` — SSR + client-initial
  // render see `null` (server snapshot), post-mount sees whatever's
  // in localStorage. No hydration mismatch, no setState-in-effect
  // for hydration.
  const cacheEntry = useSyncExternalStore(
    subscribeToProfileCache,
    getProfileCacheSnapshot,
    getProfileCacheServerSnapshot,
  );

  // Local override state — holds values from the async bootstrap +
  // auth events. `undefined` = no override yet, fall back to cache.
  // `null` = explicit sign-out (or cache-miss after bootstrap
  // resolved no user). Any `Profile` = explicit signed-in profile.
  const [profileOverride, setProfileOverride] = useState<
    Profile | null | undefined
  >(undefined);
  const [isAdminOverride, setIsAdminOverride] = useState<boolean | undefined>(
    undefined,
  );
  const [bootstrapDone, setBootstrapDone] = useState(false);

  // Effective values — explicit override wins, fall back to cache.
  const profile =
    profileOverride !== undefined ? profileOverride : cacheEntry?.profile ?? null;
  const isAdmin =
    isAdminOverride !== undefined ? isAdminOverride : cacheEntry?.isAdmin ?? false;
  // Loading only when we have no cache AND no bootstrap result yet.
  // A warm cache paints the loaded state on the first client render.
  const isLoading = !bootstrapDone && !cacheEntry;

  const setProfile = useCallback((next: Profile | null) => {
    setProfileOverride(next);
  }, []);
  const setIsAdmin = useCallback((next: boolean) => {
    setIsAdminOverride(next);
  }, []);

  const router = useRouter();
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const profileRef = useRef(profile);
  useEffect(() => { profileRef.current = profile; }, [profile]);
  const isAdminRef = useRef(isAdmin);
  useEffect(() => { isAdminRef.current = isAdmin; }, [isAdmin]);
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

  // Cheap admin probe — single indexed lookup on gym_admins. Null user
  // returns false rather than firing an unauthenticated query.
  const fetchIsAdmin = useCallback(async (userId: string): Promise<boolean> => {
    const { data, error } = await supabase
      .from("gym_admins")
      .select("user_id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();
    if (error) {
      console.warn("[chork] fetchIsAdmin failed:", error);
      return false;
    }
    return data !== null;
  }, [supabase]);

  // Persist the canonical profile + admin flag on every change so the
  // next cold open can fast-path. Clears on sign-out (profile=null).
  useEffect(() => {
    writeProfileCache(profile, isAdmin);
  }, [profile, isAdmin]);

  // Bootstrap: two-phase auth check.
  // Phase 1 (async): getSession() reads from local storage — instant,
  //          no network. Sets profile only if it changed vs cache.
  // Phase 2 (async): getUser() validates with the server — catches
  //          expired tokens. If the session was invalid, clears the
  //          profile.
  //
  // Cache hydration lives outside this effect — `useSyncExternalStore`
  // above surfaces the localStorage entry at render time so the nav
  // paints its logged-in shape on the very first client render.
  useEffect(() => {
    let initialCheckDone = false;

    async function bootstrap() {
      // Phase 1 — instant local session
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        // Profile + admin probe in parallel — both are cheap
        // single-row indexed lookups.
        const [fresh, freshIsAdmin] = await Promise.all([
          fetchProfile(session.user.id),
          fetchIsAdmin(session.user.id),
        ]);
        // Avoid re-render churn when nothing changed.
        if (
          fresh &&
          (!profileRef.current ||
            profileRef.current.id !== fresh.id ||
            profileRef.current.updated_at !== fresh.updated_at)
        ) {
          setProfile(fresh);
        }
        if (freshIsAdmin !== isAdminRef.current) {
          setIsAdmin(freshIsAdmin);
        }
      } else if (profileRef.current) {
        // Cache was stale (signed out elsewhere) — clear.
        setProfile(null);
        setIsAdmin(false);
      }
      setBootstrapDone(true);

      // Phase 2 — server validation (catches expired/revoked tokens)
      const { data: { user } } = await supabase.auth.getUser();
      if (!user && session?.user) {
        // Session was stale — clear it
        setProfile(null);
        setIsAdmin(false);
      } else if (user && !profileRef.current) {
        // Edge case: getSession had no session but getUser found one
        const [p, admin] = await Promise.all([
          fetchProfile(user.id),
          fetchIsAdmin(user.id),
        ]);
        setProfile(p);
        setIsAdmin(admin);
      }

      initialCheckDone = true;
    }

    bootstrap();

    // Listen for auth changes after bootstrap completes.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!initialCheckDone) return;

        if (event === "SIGNED_IN" && session?.user) {
          const [p, admin] = await Promise.all([
            fetchProfile(session.user.id),
            fetchIsAdmin(session.user.id),
          ]);
          setProfile(p);
          setIsAdmin(admin);
          routerRef.current.refresh();
        } else if (event === "TOKEN_REFRESHED" && session?.user) {
          if (!profileRef.current) {
            const [p, admin] = await Promise.all([
              fetchProfile(session.user.id),
              fetchIsAdmin(session.user.id),
            ]);
            setProfile(p);
            setIsAdmin(admin);
          }
        } else if (event === "SIGNED_OUT") {
          setProfile(null);
          setIsAdmin(false);
          routerRef.current.refresh();
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [supabase, fetchProfile, fetchIsAdmin, setProfile, setIsAdmin]);

  // Onboarding redirect is handled by middleware server-side.
  // No client-side redirect needed — avoids double-redirect issues.

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
    // Capture the outgoing user's id BEFORE the signOut clears state
    // so we can wipe their queued offline mutations as part of the
    // teardown. Ignore failures — the queue's per-flush userId check
    // is the authoritative gate; this is just the housekeeping pass.
    const outgoingUserId = profileRef.current?.id;
    // Server action clears the Supabase cookies via Set-Cookie on its
    // response — by the time we navigate, the browser's cookie jar is
    // already empty so the next request hits the server as anon.
    // Doing this client-side raced the cookie clear: the navigation
    // sometimes reached the server with stale auth cookies, middleware
    // passed the user through, and the page rendered signed-in (the
    // "had to hard refresh to log out" bug).
    const result = await signOutAction();
    if (result.error) {
      showToast(result.error, "error");
      return;
    }
    if (outgoingUserId) {
      // Fire-and-forget — blocking the signout UX on an IndexedDB
      // transaction isn't worth it, and the flush-time filter catches
      // anything that slips through.
      void mutationQueue.clearForUser(outgoingUserId).catch(() => {});
    }
    // Also run the browser client's signOut so its local session
    // storage is cleared in the same tick — the server action handles
    // cookies, but the browser SDK keeps its own in-memory session.
    await supabase.auth.signOut({ scope: "local" });
    setProfile(null);
    setIsAdmin(false);
    // Drop the localStorage profile cache immediately so a quick back-
    // nav before the next page load can't re-hydrate the signed-in UI.
    writeProfileCache(null, false);
    // Reset the palette too — on a shared device, leaving the previous
    // user's theme in localStorage would carry their palette into the
    // login screen and any subsequent sign-in bootstrap before the new
    // profile loads. DEFAULT_THEME clears `<html data-theme>` and the
    // `chork-theme` localStorage entry.
    setThemeStore(DEFAULT_THEME);
    showToast("Signed out", "info");
    // Hard navigation — same as signIn. router.push + refresh
    // doesn't reliably bust the RSC cache or update middleware state.
    window.location.href = "/";
  }, [supabase, setProfile, setIsAdmin]);

  const refreshProfile = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const [p, admin] = await Promise.all([
        fetchProfile(user.id),
        fetchIsAdmin(user.id),
      ]);
      setProfile(p);
      setIsAdmin(admin);
    }
  }, [supabase, fetchProfile, fetchIsAdmin, setProfile, setIsAdmin]);

  const value = useMemo(
    () => ({ profile, isAdmin, isLoading, signOut, resetPassword, refreshProfile }),
    [profile, isAdmin, isLoading, signOut, resetPassword, refreshProfile]
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
