"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FaMountain, FaHouse, FaTrophy, FaUser } from "react-icons/fa6";
import { useAuth } from "@/lib/auth-context";
import { getAvatarUrl } from "@/lib/avatar";
import styles from "./navBar.module.scss";

export function NavBar() {
  const { profile } = useAuth();
  const pathname = usePathname();

  // Pages that handle their own nav
  if (pathname === "/login" || pathname === "/onboarding") return null;

  // Unauthenticated — no bottom bar (landing has its own nav)
  if (!profile) return null;

  // Loading or authenticated — always render the bar structure
  const homeActive = pathname === "/";
  const leaderboardActive = pathname.startsWith("/leaderboard");
  const profileActive = pathname.startsWith("/u/");
  const profileHref = profile ? `/u/${profile.username}` : "#";
  const avatarUrl = profile ? getAvatarUrl(profile, { size: 64 }) : "";

  return (
    <nav className={styles.bar}>
      <div className={styles.barInner}>
        <Link href="/" className={styles.brandLink} aria-label="Home">
          <FaMountain className={styles.brandIcon} />
          <span className={styles.brandText}>Chork</span>
        </Link>

        <div className={styles.tabs}>
          <Link href="/" className={`${styles.tab} ${homeActive ? styles.tabActive : ""}`}>
            <FaHouse className={styles.tabIcon} />
            <span className={styles.tabLabel}>Home</span>
          </Link>
          <Link href="/leaderboard" className={`${styles.tab} ${leaderboardActive ? styles.tabActive : ""}`}>
            <FaTrophy className={styles.tabIcon} />
            <span className={styles.tabLabel}>Board</span>
          </Link>
          <Link href={profileHref} className={`${styles.tab} ${profileActive ? styles.tabActive : ""}`}>
            <span className={`${styles.tabAvatarWrap} ${profileActive ? styles.tabAvatarActive : ""}`}>
              {profile?.avatar_url ? (
                <Image
                  src={avatarUrl}
                  alt=""
                  width={24}
                  height={24}
                  className={styles.tabAvatar}
                  unoptimized
                />
              ) : (
                <FaUser />
              )}
            </span>
            <span className={styles.tabLabel}>Profile</span>
          </Link>
        </div>
      </div>
    </nav>
  );
}

/**
 * Top bar for the unauthenticated landing page.
 * Rendered by the landing page itself — no auth dependency, no flash.
 */
export function LandingNav() {
  return (
    <nav className={styles.topBar}>
      <Link href="/" className={styles.logoLink}>
        <FaMountain className={styles.logoIcon} />
        <span className={styles.logoText}>Chork</span>
      </Link>
      <Link href="/login" className={styles.signIn}>
        Sign in
      </Link>
    </nav>
  );
}
