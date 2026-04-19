import Link from "next/link";
import { FaArrowLeft } from "react-icons/fa6";
import { PageHeader } from "@/components/motion";
import { Button } from "@/components/ui";
import styles from "./privacy.module.scss";

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
        <Link href="/" className={styles.backLink}>
          <Button variant="secondary">
            <FaArrowLeft aria-hidden />
            Back to Chork
          </Button>
        </Link>
      </footer>
    </main>
  );
}
