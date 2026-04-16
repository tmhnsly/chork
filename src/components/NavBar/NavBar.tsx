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

export function NavBar() {
  const { profile, isAdmin, isLoading } = useAuth();
  const pathname = usePathname();

  if (pathname === "/login" || pathname === "/onboarding") return null;

  // Unauthenticated: brand + Gyms (for-gym marketing) + Sign in
  if (!isLoading && !profile) {
    const gymsActive = pathname.startsWith("/gyms");
    return (
      <nav className={styles.bar}>
        <div className={styles.barInner}>
          <Link href="/" className={styles.brandLinkVisible} aria-label="Chork — home">
            <ChorkMark size={18} />
            <span className={styles.brandTextVisible}>Chork</span>
          </Link>
          <Link
            href="/gyms"
            className={`${styles.tab} ${gymsActive ? styles.tabActive : ""}`}
            aria-current={gymsActive ? "page" : undefined}
          >
            <FaMountainSun className={styles.tabIcon} aria-hidden />
            <span className={styles.tabLabel}>Gyms</span>
          </Link>
          <Link href="/login" className={styles.tab}>
            <FaRightToBracket className={styles.tabIcon} aria-hidden />
            <span className={styles.tabLabel}>Sign in</span>
          </Link>
        </div>
      </nav>
    );
  }

  // Loading or momentarily profile-less (session resolving) — brand
  // only, no tabs. Skips the authenticated branch's profile-not-null
  // assertion below.
  if (isLoading || !profile) {
    return (
      <nav className={styles.bar}>
        <div className={styles.barInner}>
          <Link href="/" className={styles.brandLinkVisible} aria-label="Chork — home">
            <ChorkMark size={18} />
            <span className={styles.brandTextVisible}>Chork</span>
          </Link>
        </div>
      </nav>
    );
  }

  return <AuthenticatedNav userId={profile.id} pathname={pathname} isAdmin={isAdmin} />;
}

function AuthenticatedNav({
  userId,
  pathname,
  isAdmin,
}: {
  userId: string;
  pathname: string;
  isAdmin: boolean;
}) {
  const homeActive = pathname === "/";
  const leaderboardActive = pathname.startsWith("/leaderboard");
  const crewActive = pathname.startsWith("/crew");
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

  // ── Sliding pill highlight ─────────────────────────
  // Measures the active tab's bounding rect and writes the result
  // directly to the `.pill` element via a ref. This is one of the
  // rare cases where touching the DOM in a layout effect is the
  // right move — we're syncing to an external (visual) system, not
  // setting React state, so `react-hooks/refs` and
  // `set-state-in-effect` both stay out of the way.
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
  }, [pathname, badgeCount]);

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
          <Link href="/" className={`${styles.tab} ${homeActive ? styles.tabActive : ""}`} aria-current={homeActive ? "page" : undefined}>
            <FaBorderAll className={styles.tabIcon} aria-hidden />
            <span className={styles.tabLabel}>Wall</span>
          </Link>
          <Link href="/leaderboard" className={`${styles.tab} ${leaderboardActive ? styles.tabActive : ""}`} aria-current={leaderboardActive ? "page" : undefined}>
            <FaTrophy className={styles.tabIcon} aria-hidden />
            <span className={styles.tabLabel}>Board</span>
          </Link>
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
          {isAdmin && (
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
