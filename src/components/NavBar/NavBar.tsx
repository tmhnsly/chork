"use client";

import {
  useEffect,
  useState,
  useCallback,
  useRef,
  useLayoutEffect,
  useSyncExternalStore,
} from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  FaBorderAll,
  FaTrophy,
  FaUser,
  FaRightToBracket,
  FaUserGroup,
  FaMountainSun,
  FaScrewdriverWrench,
  FaFire,
} from "react-icons/fa6";
import { ChorkMark } from "@/components/ui";
import { useAuth } from "@/lib/auth-context";
import { createBrowserSupabase } from "@/lib/supabase/client";
import styles from "./navBar.module.scss";

// Badge acknowledgement is client-side only: a user seeing the Crew tab
// clears the badge until a NEW invite arrives past the acknowledged
// count. Persisted in localStorage keyed by userId so multi-account
// usage on one device stays correct.
const CREW_ACK_KEY_PREFIX = "chork-crew-invites-ack:";

// useSyncExternalStore-friendly read of the acknowledged invite count.
// Subscribes to the `storage` event so changes from other tabs propagate,
// and dispatches a synthetic event when we write from this tab.
function subscribeToStorage(callback: () => void): () => void {
  window.addEventListener("storage", callback);
  window.addEventListener("chork-crew-ack", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("chork-crew-ack", callback);
  };
}

function writeAckCount(userId: string, value: number): void {
  try {
    window.localStorage.setItem(CREW_ACK_KEY_PREFIX + userId, String(value));
  } catch {
    // localStorage may be blocked — noop
  }
  window.dispatchEvent(new Event("chork-crew-ack"));
}

function readAckCount(userId: string): number {
  try {
    const stored = window.localStorage.getItem(CREW_ACK_KEY_PREFIX + userId);
    return stored ? Number.parseInt(stored, 10) || 0 : 0;
  } catch {
    return 0;
  }
}

// Sliding pill highlight: measures whichever tab carries
// `aria-current="page"` and writes the result directly to the
// `.pill` element via a ref. Touching the DOM in a layout effect is
// the right move here — we're syncing to an external (visual) system,
// not setting React state, so `react-hooks/refs` and
// `set-state-in-effect` both stay out of the way. Shared by both the
// signed-in and signed-out nav so the pill behaviour (and the
// implicit "nav is active when you're on this route" visual) matches
// in both states.
function useSlidingPill(...deps: unknown[]): {
  tabsRef: React.RefObject<HTMLDivElement | null>;
  pillRef: React.RefObject<HTMLSpanElement | null>;
} {
  const tabsRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const tabs = tabsRef.current;
    const pill = pillRef.current;
    if (!tabs || !pill) return;
    const active = tabs.querySelector<HTMLElement>('[aria-current="page"]');
    if (!active) {
      pill.style.opacity = "0";
      return;
    }
    const parent = tabs.getBoundingClientRect();
    const rect = active.getBoundingClientRect();
    pill.style.opacity = "1";
    pill.style.transform = `translateX(${rect.left - parent.left}px)`;
    pill.style.width = `${rect.width}px`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { tabsRef, pillRef };
}

export type InitialShell = "unauthed" | "authed-no-gym" | "authed-with-gym";

interface NavBarProps {
  /**
   * Which shell to paint on first byte. Set by `NavBarShell` (server
   * component) based on the `chork-auth-shell` cookie that middleware
   * stamps on every response. Prevents the "unauthed nav → authed
   * nav" flash on refresh by ensuring the server-rendered HTML
   * already matches the final authed shape. The 3-state value also
   * lets the gymless variant (Crew / Jam / Profile only) paint
   * correctly for users who've not yet added a gym.
   */
  initialShell: InitialShell;
}

export function NavBar({ initialShell }: NavBarProps) {
  const { profile, isAdmin, isLoading } = useAuth();
  const pathname = usePathname();

  // Onboarding is a focus-locked flow (profile-setup wizard) — hiding
  // the nav there keeps the user on the happy path. Every other
  // route, including /login, keeps the nav visible so the user can
  // always get back out to a gym marketing page or cancel a sign-in.
  if (pathname === "/onboarding") return null;

  // Profile resolved — render the real nav, picking the gym-aware
  // variant.
  if (profile) {
    return (
      <AuthenticatedNav
        userId={profile.id}
        pathname={pathname}
        isAdmin={isAdmin}
        hasGym={!!profile.active_gym_id}
      />
    );
  }
  if (!isLoading) {
    // Done loading, no profile — genuinely unauthed.
    return <UnauthenticatedNav pathname={pathname} />;
  }

  // Still loading — paint the shell the server cookie told us to
  // expect so SSR and client-initial render match exactly. The
  // authed skeleton carries the same tab structure as the real
  // authenticated nav (minus badges + admin tab), so the eventual
  // swap to the full component is a no-op visually for most users.
  if (initialShell === "authed-with-gym") {
    return <AuthedNavSkeleton pathname={pathname} hasGym={true} />;
  }
  if (initialShell === "authed-no-gym") {
    return <AuthedNavSkeleton pathname={pathname} hasGym={false} />;
  }
  return <UnauthenticatedNav pathname={pathname} />;
}

// Minimal authed shell — rendered on first paint when the server
// cookie indicates the user is signed in but `AuthProvider` hasn't
// finished its bootstrap yet. Drops the badge counts and the Admin
// tab (neither is knowable without the profile). The full
// `AuthenticatedNav` takes over as soon as bootstrap completes.
function AuthedNavSkeleton({ pathname, hasGym }: { pathname: string; hasGym: boolean }) {
  const homeActive = pathname === "/";
  const leaderboardActive = pathname.startsWith("/leaderboard");
  const crewActive = pathname.startsWith("/crew");
  const jamActive = pathname.startsWith("/jam");
  const profileActive = pathname.startsWith("/profile") || pathname.startsWith("/u/");

  const { tabsRef, pillRef } = useSlidingPill(pathname, hasGym);

  return (
    <nav className={styles.bar}>
      <div className={styles.barInner}>
        <Link href="/" className={styles.brandLink} aria-label="Chork — home">
          <ChorkMark size={18} />
          <span className={styles.brandText}>Chork</span>
        </Link>

        <div className={styles.tabs} ref={tabsRef}>
          <span className={styles.pill} ref={pillRef} aria-hidden />
          {hasGym && (
            <Link href="/" className={`${styles.tab} ${homeActive ? styles.tabActive : ""}`} aria-current={homeActive ? "page" : undefined}>
              <FaBorderAll className={styles.tabIcon} aria-hidden />
              <span className={styles.tabLabel}>Wall</span>
            </Link>
          )}
          {hasGym && (
            <Link href="/leaderboard" className={`${styles.tab} ${leaderboardActive ? styles.tabActive : ""}`} aria-current={leaderboardActive ? "page" : undefined}>
              <FaTrophy className={styles.tabIcon} aria-hidden />
              <span className={styles.tabLabel}>Board</span>
            </Link>
          )}
          <Link href="/crew" className={`${styles.tab} ${crewActive ? styles.tabActive : ""}`} aria-current={crewActive ? "page" : undefined}>
            <FaUserGroup className={styles.tabIcon} aria-hidden />
            <span className={styles.tabLabel}>Crew</span>
          </Link>
          <Link href="/jam" className={`${styles.tab} ${jamActive ? styles.tabActive : ""}`} aria-current={jamActive ? "page" : undefined}>
            <FaFire className={styles.tabIcon} aria-hidden />
            <span className={styles.tabLabel}>Jam</span>
          </Link>
          <Link href="/profile" className={`${styles.tab} ${profileActive ? styles.tabActive : ""}`} aria-current={profileActive ? "page" : undefined}>
            <FaUser className={styles.tabIcon} aria-hidden />
            <span className={styles.tabLabel}>Profile</span>
          </Link>
        </div>

        <div className={styles.brandSpacer} aria-hidden="true" />
      </div>
    </nav>
  );
}

function AuthenticatedNav({
  userId,
  pathname,
  isAdmin,
  hasGym,
}: {
  userId: string;
  pathname: string;
  isAdmin: boolean;
  hasGym: boolean;
}) {
  const homeActive = pathname === "/";
  const leaderboardActive = pathname.startsWith("/leaderboard");
  const crewActive = pathname.startsWith("/crew");
  const jamActive = pathname.startsWith("/jam");
  const adminActive = pathname.startsWith("/admin");
  const profileActive = pathname.startsWith("/profile") || pathname.startsWith("/u/");

  // Acknowledged count is read from localStorage via an external
  // store — avoids setState-in-effect warnings and keeps multi-tab
  // acks in sync through the `storage` event.
  const ackCount = useSyncExternalStore(
    subscribeToStorage,
    () => readAckCount(userId),
    () => 0 // server snapshot — badge is invisible during SSR
  );

  const [pendingCount, setPendingCount] = useState<number>(0);

  // Pull the live pending-invite count. We re-fetch on initial mount
  // and whenever the user lands on / leaves the /crew route — those
  // are the only nav transitions where the count can realistically
  // change (they either accept / decline, or a new invite has been
  // queued while they were off-tab). Re-firing on every page nav
  // (home → leaderboard → profile) was wasted Supabase bandwidth.
  const isOnCrew = pathname.startsWith("/crew");
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createBrowserSupabase();
      const { count } = await supabase
        .from("crew_members")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("status", "pending");
      if (!cancelled) setPendingCount(count ?? 0);
    })();
    return () => { cancelled = true; };
  }, [userId, isOnCrew]);

  // When the user lands on /crew, flush the acknowledgement to match
  // the current pending count. Any new invites after this point will
  // re-surface the badge.
  const ackIfOnCrew = useCallback(() => {
    if (!crewActive) return;
    if (pendingCount === ackCount) return;
    writeAckCount(userId, pendingCount);
  }, [crewActive, pendingCount, ackCount, userId]);

  useEffect(() => { ackIfOnCrew(); }, [ackIfOnCrew]);

  const badgeCount = Math.max(0, pendingCount - ackCount);

  // Pill re-measures on route change + whenever the Crew tab's
  // badge mounts/unmounts (badge changes the tab's width, which the
  // sliding highlight has to follow).
  const { tabsRef, pillRef } = useSlidingPill(pathname, badgeCount, hasGym, isAdmin);

  return (
    <nav className={styles.bar}>
      <div className={styles.barInner}>
        <Link href="/" className={styles.brandLink} aria-label="Chork — home">
          <ChorkMark size={18} />
          <span className={styles.brandText}>Chork</span>
        </Link>

        <div className={styles.tabs} ref={tabsRef}>
          {/* Initial opacity:0 lives on `.pill` in the SCSS so first
              paint stays clean — useLayoutEffect above flips it to 1
              once the active tab's rect has been measured. */}
          <span
            className={styles.pill}
            ref={pillRef}
            aria-hidden
          />
          {hasGym && (
            <Link href="/" className={`${styles.tab} ${homeActive ? styles.tabActive : ""}`} aria-current={homeActive ? "page" : undefined}>
              <FaBorderAll className={styles.tabIcon} aria-hidden />
              <span className={styles.tabLabel}>Wall</span>
            </Link>
          )}
          {hasGym && (
            <Link href="/leaderboard" className={`${styles.tab} ${leaderboardActive ? styles.tabActive : ""}`} aria-current={leaderboardActive ? "page" : undefined}>
              <FaTrophy className={styles.tabIcon} aria-hidden />
              <span className={styles.tabLabel}>Board</span>
            </Link>
          )}
          <Link
            href="/crew"
            className={`${styles.tab} ${crewActive ? styles.tabActive : ""}`}
            aria-current={crewActive ? "page" : undefined}
          >
            <span className={styles.tabIconWrap}>
              <FaUserGroup className={styles.tabIcon} aria-hidden />
              {badgeCount > 0 && (
                <span className={styles.tabBadge} aria-label={`${badgeCount} pending invite${badgeCount === 1 ? "" : "s"}`}>
                  {badgeCount > 9 ? "9+" : badgeCount}
                </span>
              )}
            </span>
            <span className={styles.tabLabel}>Crew</span>
          </Link>
          <Link
            href="/jam"
            className={`${styles.tab} ${jamActive ? styles.tabActive : ""}`}
            aria-current={jamActive ? "page" : undefined}
          >
            <FaFire className={styles.tabIcon} aria-hidden />
            <span className={styles.tabLabel}>Jam</span>
          </Link>
          {isAdmin && hasGym && (
            <Link
              href="/admin"
              className={`${styles.tab} ${adminActive ? styles.tabActive : ""}`}
              aria-current={adminActive ? "page" : undefined}
            >
              <FaScrewdriverWrench className={styles.tabIcon} aria-hidden />
              <span className={styles.tabLabel}>Admin</span>
            </Link>
          )}
          <Link
            href="/profile"
            className={`${styles.tab} ${profileActive ? styles.tabActive : ""}`}
            aria-current={profileActive ? "page" : undefined}
          >
            <span className={styles.tabIconWrap}>
              <FaUser className={styles.tabIcon} aria-hidden />
              {badgeCount > 0 && <span className={styles.tabDot} aria-hidden />}
            </span>
            <span className={styles.tabLabel}>Profile</span>
          </Link>
        </div>

        {/* Counterweight spacer — matches brandLink width to keep tabs centred */}
        <div className={styles.brandSpacer} aria-hidden="true" />
      </div>
    </nav>
  );
}

// Unauthenticated shell — brand + Gyms (for-gym marketing) + Sign in.
// Shares the sliding-pill hook with AuthenticatedNav so the active-tab
// highlight reads the same in both states. Active-route detection
// matches the signed-in branch's semantics: `/gyms*` → Gyms tab;
// `/login*` → Sign in tab.
function UnauthenticatedNav({ pathname }: { pathname: string }) {
  const homeActive = pathname === "/";
  const gymsActive = pathname.startsWith("/gyms");
  const loginActive = pathname.startsWith("/login");
  const { tabsRef, pillRef } = useSlidingPill(pathname);

  return (
    <nav className={styles.bar}>
      <div className={styles.barInner}>
        <Link
          href="/"
          className={`${styles.brandLinkVisible} ${homeActive ? styles.brandLinkActive : ""}`}
          aria-label="Chork — home"
          aria-current={homeActive ? "page" : undefined}
        >
          <ChorkMark size={18} mode={homeActive ? "accent" : "auto"} />
          <span className={styles.brandTextVisible}>Chork</span>
        </Link>

        <div className={styles.tabs} ref={tabsRef}>
          <span className={styles.pill} ref={pillRef} aria-hidden />
          <Link
            href="/gyms"
            className={`${styles.tab} ${gymsActive ? styles.tabActive : ""}`}
            aria-current={gymsActive ? "page" : undefined}
          >
            <FaMountainSun className={styles.tabIcon} aria-hidden />
            <span className={styles.tabLabel}>Gyms</span>
          </Link>
          <Link
            href="/login"
            className={`${styles.tab} ${loginActive ? styles.tabActive : ""}`}
            aria-current={loginActive ? "page" : undefined}
          >
            <FaRightToBracket className={styles.tabIcon} aria-hidden />
            <span className={styles.tabLabel}>Sign in</span>
          </Link>
        </div>
      </div>
    </nav>
  );
}
