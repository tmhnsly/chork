"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FaMountain, FaHouse, FaTrophy, FaUser } from "react-icons/fa6";
import { useAuth } from "@/lib/auth-context";
import { getAvatarUrl } from "@/lib/avatar";
import styles from "./navBar.module.scss";

export function NavBar() {
  const { user, isLoading } = useAuth();
  const pathname = usePathname();

  // Unauthenticated: top bar with logo + sign in
  if (isLoading || !user) {
    return (
      <nav className={styles.topBar}>
        <Link href="/" className={styles.logoLink}>
          <FaMountain className={styles.logoIcon} />
          <span className={styles.logoText}>Chork</span>
        </Link>
        {!isLoading && (
          <Link href="/login" className={styles.signIn}>
            Sign in
          </Link>
        )}
      </nav>
    );
  }

  // Don't show nav on login/onboarding
  if (pathname === "/login" || pathname === "/onboarding") return null;

  const homeActive = pathname === "/";
  const leaderboardActive = pathname.startsWith("/leaderboard");
  const profileActive = pathname.startsWith("/u/");

  const avatarUrl = getAvatarUrl(user, { thumb: "64x64" });

  const profileIcon = user.avatar ? (
    <Image
      src={avatarUrl}
      alt=""
      width={24}
      height={24}
      className={`${styles.tabAvatar} ${profileActive ? styles.tabAvatarActive : ""}`}
      unoptimized
    />
  ) : (
    <FaUser className={styles.tabIcon} />
  );

  return (
    <>
      {/* Desktop: top bar with logo + nav links (hidden on mobile) */}
      <nav className={`${styles.topBar} ${styles.desktopOnly}`}>
        <Link href="/" className={styles.logoLink}>
          <FaMountain className={styles.logoIcon} />
          <span className={styles.logoText}>Chork</span>
        </Link>
        <div className={styles.desktopNav}>
          <Link href="/leaderboard" className={`${styles.desktopLink} ${leaderboardActive ? styles.desktopLinkActive : ""}`}>
            Leaderboard
          </Link>
          <Link href={`/u/${user.username}`} className={styles.avatarLink}>
            <Image
              src={avatarUrl}
              alt={user.name || user.username}
              width={36}
              height={36}
              className={styles.avatar}
              unoptimized
            />
          </Link>
        </div>
      </nav>

      {/* Mobile: bottom tab bar */}
      <nav className={styles.bottomBar}>
        <Link href="/" className={`${styles.tab} ${homeActive ? styles.tabActive : ""}`}>
          <FaHouse className={styles.tabIcon} />
          <span className={styles.tabLabel}>Home</span>
        </Link>
        <Link href="/leaderboard" className={`${styles.tab} ${leaderboardActive ? styles.tabActive : ""}`}>
          <FaTrophy className={styles.tabIcon} />
          <span className={styles.tabLabel}>Leaderboard</span>
        </Link>
        <Link href={`/u/${user.username}`} className={`${styles.tab} ${profileActive ? styles.tabActive : ""}`}>
          {profileIcon}
          <span className={styles.tabLabel}>Profile</span>
        </Link>
      </nav>
    </>
  );
}
