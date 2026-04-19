import Link from "next/link";
import { FaInstagram, FaEnvelope } from "react-icons/fa6";
import { BrandDivider } from "@/components/ui/BrandDivider";
import { ChorkMark } from "@/components/ui";
import styles from "./siteFooter.module.scss";

// `new Date()` can't run in a "use client" render body without
// tripping the `react-hooks/purity` rule. Hoisted to module scope so
// the year evaluates once on first import; render just reads it.
const COPYRIGHT_YEAR = new Date().getFullYear();

/**
 * Site-wide marketing footer. Mounted on every externally reachable
 * brand surface (landing, /gyms) so social + legal chrome is always
 * one tap away regardless of entry point. Compact signoff — a small
 * ChorkMark, social icons, legal links, and a combined copyright +
 * "Est 2026" line. Handles its own safe-area + navbar-clearance
 * padding so the mounting page can keep `padding-bottom: 0` without
 * clipping behind the floating nav pill.
 */
export function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <ChorkMark className={styles.mark} mode="auto" />

      <nav aria-label="Contact Chork" className={styles.social}>
        <a
          href="https://instagram.com/chork.app"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Chork on Instagram"
          className={styles.socialLink}
        >
          <FaInstagram aria-hidden />
        </a>
        <a
          href="mailto:hello@chork.app"
          aria-label="Email Chork"
          className={styles.socialLink}
        >
          <FaEnvelope aria-hidden />
        </a>
      </nav>

      <div className={styles.links}>
        <Link href="/privacy" className={styles.link}>Privacy</Link>
        <BrandDivider />
        <Link href="/terms" className={styles.link}>Terms</Link>
      </div>

      <span className={styles.copyright}>
        &copy; {COPYRIGHT_YEAR} Chork
      </span>
    </footer>
  );
}
