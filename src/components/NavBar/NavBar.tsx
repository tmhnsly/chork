"use client";

import Link from "next/link";
import { FaMountain } from "react-icons/fa6";
import { useAuth } from "@/lib/auth-context";
import { getAvatarUrl } from "@/lib/avatar";
import styles from "./navBar.module.scss";

export function NavBar() {
  const { user, isLoading } = useAuth();

  return (
    <nav className={styles.bar}>
      <Link href="/" className={styles.logoLink}>
        <FaMountain className={styles.logoIcon} />
        <span className={styles.logoText}>Chork</span>
      </Link>

      <div className={styles.right}>
        {isLoading ? null : !user ? (
          <Link href="/login" className={styles.signIn}>
            Sign in
          </Link>
        ) : (
          <Link href="/profile" className={styles.avatarLink}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={getAvatarUrl(user, { thumb: "80x80" })}
              alt={user.name || user.username}
              className={styles.avatar}
            />
          </Link>
        )}
      </div>
    </nav>
  );
}
