"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FaMountain, FaBorderAll, FaTrophy, FaUser, FaRightToBracket } from "react-icons/fa6";
import { useAuth } from "@/lib/auth-context";
import { getAvatarUrl } from "@/lib/avatar";
import styles from "./navBar.module.scss";

export function NavBar() {
  const { profile, isLoading } = useAuth();
  const pathname = usePathname();

  if (pathname === "/login" || pathname === "/onboarding") return null;

  const homeActive = pathname === "/";
  const leaderboardActive = pathname.startsWith("/leaderboard");
  const profileActive = pathname.startsWith("/u/");

  return (
    <nav className={styles.bar}>
      <div className={styles.barInner}>
        <Link href="/" className={styles.brandLink} aria-label="Home">
          <FaMountain className={styles.brandIcon} />
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

          {profile ? (
            <Link href={`/u/${profile.username}`} className={`${styles.tab} ${profileActive ? styles.tabActive : ""}`}>
              <span className={`${styles.tabAvatarWrap} ${profileActive ? styles.tabAvatarActive : ""}`}>
                {profile.avatar_url ? (
                  <Image
                    src={getAvatarUrl(profile, { size: 64 })}
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
          ) : isLoading ? (
            // Placeholder while auth is resolving - prevents "Sign in" flash
            <span className={styles.tab}>
              <FaUser className={styles.tabIcon} />
              <span className={styles.tabLabel}>Profile</span>
            </span>
          ) : (
            <Link href="/login" className={styles.tab}>
              <FaRightToBracket className={styles.tabIcon} />
              <span className={styles.tabLabel}>Sign in</span>
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
