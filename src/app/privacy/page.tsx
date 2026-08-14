import Link from "next/link";
import { FaArrowLeft } from "react-icons/fa6";
import { PageHeader } from "@/components/motion";
import { LinkButton } from "@/components/ui";
import styles from "./privacy.module.scss";

/**
 * Prerendered at build time and served from the CDN — no function
 * invocation, so this page never pays a serverless cold start.
 *
 * It needs the directive rather than qualifying automatically because
 * `NavBarShell` sits in the root layout and calls `cookies()`, which
 * opts *every* route into dynamic rendering. Under `force-static`,
 * `cookies()` returns empty instead of forcing that, so the shared
 * chrome stops dragging static content onto the server.
 *
 * The trade-off is confined to the nav: with no cookie to read,
 * `NavBarShell` paints its unauthed shell on first byte and the client
 * corrects it on hydration from the profile cache. That's the pop-in
 * the cookie indirection exists to prevent, and it's the right trade
 * here — this page has no per-user content, is rarely a session's
 * entry point, and a CDN hit beats a cold start by seconds.
 */
export const dynamic = "force-static";

export const metadata = {
  title: "Privacy Policy - Chork",
};

export default function PrivacyPage() {
  return (
    <main className={styles.page}>
      <PageHeader title="Privacy Policy" subtitle="Last updated: April 2026" />

      <section className={styles.section}>
        <h2 className={styles.heading}>Your privacy matters</h2>
        <p>
          Chork is built with user privacy as a priority. We collect the minimum data
          needed to provide the service and never sell your information to third parties.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>What we collect</h2>
        <ul className={styles.list}>
          <li><strong>Account info</strong> - email address, username, display name</li>
          <li><strong>Climbing data</strong> - route attempts, completions, grades, comments</li>
          <li><strong>Gym membership</strong> - which gyms you belong to and your role</li>
        </ul>
        <p>
          We do not collect location data, device identifiers, or analytics tracking data.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>How we use it</h2>
        <p>
          Your data is used solely to provide the Chork service - showing your stats,
          powering leaderboards, and enabling beta spray comments. We do not use your
          data for advertising or profiling.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>Data storage</h2>
        <p>
          Data is stored securely in Supabase (hosted on AWS in the EU). All connections
          use TLS encryption. Database access is controlled by Row Level Security policies
          that isolate your data from other users and gyms.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>Your rights (GDPR)</h2>
        <p>As a user in the EU, you have the right to:</p>
        <ul className={styles.list}>
          <li><strong>Access</strong> - view all data we hold about you (visible in your profile)</li>
          <li><strong>Rectification</strong> - edit your profile information at any time</li>
          <li><strong>Erasure</strong> - permanently delete your account and all associated data</li>
          <li><strong>Portability</strong> - request a copy of your data</li>
        </ul>
        <p>
          To delete your account, go to your profile, tap the settings gear, and select
          &ldquo;Delete account&rdquo;. All your data will be permanently removed.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>Cookies</h2>
        <p>
          We use a single essential session cookie to keep you signed in. No tracking
          cookies, no third-party cookies, no cookie banner needed.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>Contact</h2>
        <p>
          Questions about your privacy? Get in touch at{" "}
          <Link href="mailto:hello@chork.app" className={styles.link}>hello@chork.app</Link>.
        </p>
      </section>

      <footer className={styles.footer}>
        <LinkButton href="/" className={styles.backLink} variant="secondary">
          <FaArrowLeft aria-hidden />
          Back to Chork
        </LinkButton>
      </footer>
    </main>
  );
}
