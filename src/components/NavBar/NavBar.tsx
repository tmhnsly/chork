"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FaBorderAll, FaTrophy, FaUser, FaRightToBracket } from "react-icons/fa6";
import { ChorkMark } from "@/components/ui";
import { useAuth } from "@/lib/auth-context";
import styles from "./navBar.module.scss";

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

  // Authenticated: full nav
  const homeActive = pathname === "/";
  const leaderboardActive = pathname.startsWith("/leaderboard");
  const profileActive = pathname.startsWith("/u/");

  return (
    <nav className={styles.bar}>
      <div className={styles.barInner}>
        <Link href="/" className={styles.brandLink} aria-label="Home">
          <ChorkMark size={18} />
          <span className={styles.brandText}>Chork</span>
        </Link>

        <div className={styles.tabs}>
          <Link href="/" className={`${styles.tab} ${homeActive ? styles.tabActive : ""}`}>
            <FaBorderAll className={styles.tabIcon} />
            <span className={styles.tabLabel}>Wall</span>
          </Link>
          <Link href="/leaderboard" className={`${styles.tab} ${leaderboardActive ? styles.tabActive : ""}`}>
            <FaTrophy className={styles.tabIcon} />
            <span className={styles.tabLabel}>Board</span>
          </Link>
          <Link href={`/u/${profile!.username}`} className={`${styles.tab} ${profileActive ? styles.tabActive : ""}`}>
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
