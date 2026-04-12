"use client";

import { useEffect, useState, useCallback, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  FaBorderAll,
  FaTrophy,
  FaUser,
  FaRightToBracket,
  FaUserGroup,
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
  const { profile, isLoading } = useAuth();
  const pathname = usePathname();

  if (pathname === "/login" || pathname === "/onboarding") return null;

  // Unauthenticated: brand + sign in only
  if (!isLoading && !profile) {
    return (
      <nav className={styles.bar}>
        <div className={styles.barInner}>
          <Link href="/" className={styles.brandLinkVisible} aria-label="Home">
            <ChorkMark size={18} />
            <span className={styles.brandTextVisible}>Chork</span>
          </Link>
          <Link href="/login" className={styles.tab}>
            <FaRightToBracket className={styles.tabIcon} />
            <span className={styles.tabLabel}>Sign in</span>
          </Link>
        </div>
      </nav>
    );
  }

  // Loading: brand only, no tabs (prevents flash)
  if (isLoading) {
    return (
      <nav className={styles.bar}>
        <div className={styles.barInner}>
          <Link href="/" className={styles.brandLinkVisible} aria-label="Home">
            <ChorkMark size={18} />
            <span className={styles.brandTextVisible}>Chork</span>
          </Link>
        </div>
      </nav>
    );
  }

  return <AuthenticatedNav userId={profile!.id} username={profile!.username} pathname={pathname} />;
}

function AuthenticatedNav({
  userId,
  username,
  pathname,
}: {
  userId: string;
  username: string;
  pathname: string;
}) {
  const homeActive = pathname === "/";
  const leaderboardActive = pathname.startsWith("/leaderboard");
  const crewActive = pathname.startsWith("/crew");
  const profileActive = pathname.startsWith("/u/");

  // Acknowledged count is read from localStorage via an external
  // store — avoids setState-in-effect warnings and keeps multi-tab
  // acks in sync through the `storage` event.
  const ackCount = useSyncExternalStore(
    subscribeToStorage,
    () => readAckCount(userId),
    () => 0 // server snapshot — badge is invisible during SSR
  );

  const [pendingCount, setPendingCount] = useState<number>(0);

  // Pull the live pending-invite count for the signed-in user from the
  // DB. The effect runs once per userId; updates come through on route
  // changes (revalidatePath in crew actions triggers a re-render of
  // this component as part of the tree refresh).
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
  }, [userId, pathname]);

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

  return (
    <nav className={styles.bar}>
      <div className={styles.barInner}>
        <Link href="/" className={styles.brandLink} aria-label="Home">
          <ChorkMark size={18} />
          <span className={styles.brandText}>Chork</span>
        </Link>

        <div className={styles.tabs}>
          <Link href="/" className={`${styles.tab} ${homeActive ? styles.tabActive : ""}`} aria-current={homeActive ? "page" : undefined}>
            <FaBorderAll className={styles.tabIcon} />
            <span className={styles.tabLabel}>Wall</span>
          </Link>
          <Link href="/leaderboard" className={`${styles.tab} ${leaderboardActive ? styles.tabActive : ""}`} aria-current={leaderboardActive ? "page" : undefined}>
            <FaTrophy className={styles.tabIcon} />
            <span className={styles.tabLabel}>Board</span>
          </Link>
          <Link
            href="/crew"
            className={`${styles.tab} ${crewActive ? styles.tabActive : ""}`}
            aria-current={crewActive ? "page" : undefined}
          >
            <span className={styles.tabIconWrap}>
              <FaUserGroup className={styles.tabIcon} />
              {badgeCount > 0 && (
                <span className={styles.tabBadge} aria-label={`${badgeCount} pending invite${badgeCount === 1 ? "" : "s"}`}>
                  {badgeCount > 9 ? "9+" : badgeCount}
                </span>
              )}
            </span>
            <span className={styles.tabLabel}>Crew</span>
          </Link>
          <Link href={`/u/${username}`} className={`${styles.tab} ${profileActive ? styles.tabActive : ""}`} aria-current={profileActive ? "page" : undefined}>
            <FaUser className={styles.tabIcon} />
            <span className={styles.tabLabel}>Profile</span>
          </Link>
        </div>

        {/* Counterweight spacer — matches brandLink width to keep tabs centred */}
        <div className={styles.brandSpacer} aria-hidden="true" />
      </div>
    </nav>
  );
}
