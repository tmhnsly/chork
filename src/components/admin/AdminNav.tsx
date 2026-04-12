"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./adminNav.module.scss";

const LINKS = [
  { href: "/admin",              label: "Dashboard" },
  { href: "/admin/sets",         label: "Sets" },
  { href: "/admin/competitions", label: "Competitions" },
];

/**
 * Admin sub-nav rendered at the top of every admin surface. Client
 * component so the active state highlights without a round-trip.
 * Matches the segmented-control visual pattern used on the Chorkboard
 * for tab-style switching.
 */
export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className={styles.nav} aria-label="Admin sections">
      {LINKS.map((link) => {
        const isActive =
          link.href === "/admin"
            ? pathname === "/admin"
            : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`${styles.link} ${isActive ? styles.linkActive : ""}`}
            aria-current={isActive ? "page" : undefined}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
