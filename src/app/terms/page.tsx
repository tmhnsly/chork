import Link from "next/link";
import { PageHeader } from "@/components/motion";
import styles from "./terms.module.scss";

export const metadata = {
  title: "Terms of Service - Chork",
  description:
    "The terms governing your use of Chork — the bouldering competition tracker for gyms and climbers.",
};

export default function TermsPage() {
  return (
    <main className={styles.page}>
      <PageHeader title="Terms of Service" subtitle="Last updated: April 2026" />

      <section className={styles.section}>
        <h2 className={styles.heading}>1. Agreement</h2>
        <p>
          These Terms of Service (the &ldquo;Terms&rdquo;) govern your access to
          and use of Chork (the &ldquo;Service&rdquo;), a bouldering
          competition tracker operated by Chork (&ldquo;we&rdquo;,
          &ldquo;us&rdquo;, &ldquo;our&rdquo;). By creating an account, visiting
          the website, or otherwise using the Service you agree to be bound by
          these Terms. If you do not agree, you must not use the Service.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>2. Eligibility</h2>
        <p>
          You must be at least 13 years old to use Chork. If you are under 18,
          you confirm that you have permission from a parent or legal guardian
          to create an account and use the Service. If you are a gym admin or
          competition organiser, you confirm you have authority to act on
          behalf of the gym or event you are managing.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>3. Your account</h2>
        <ul className={styles.list}>
          <li>You must provide accurate information when creating an account.</li>
          <li>You are responsible for keeping your password secure. Do not share your account.</li>
          <li>One account per person. Accounts are not transferable.</li>
          <li>You must notify us at once if you suspect unauthorised access to your account.</li>
        </ul>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>4. Acceptable use</h2>
        <p>
          You agree to use the Service in good faith and in line with the spirit
          of climbing. You will not:
        </p>
        <ul className={styles.list}>
          <li>Log sends, attempts, flashes or zones you did not actually complete.</li>
          <li>Impersonate another climber, gym or organisation.</li>
          <li>Harass, abuse, threaten or intimidate other users in beta spray, crew chat, or anywhere else on the Service.</li>
          <li>Post unlawful, hateful, sexually explicit, or otherwise objectionable content.</li>
          <li>Scrape, harvest, or otherwise extract data from the Service beyond what the product surfaces to you as a user.</li>
          <li>Attempt to reverse engineer, probe, or exploit the Service&rsquo;s security.</li>
          <li>Interfere with other users&rsquo; enjoyment of the Service, including abusing reporting features or flooding leaderboards with fake accounts.</li>
          <li>Use the Service to break any law applicable to you.</li>
        </ul>
        <p>
          We may remove content, suspend accounts, or terminate access at our
          discretion where we reasonably believe a user has broken these rules.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>5. Content you create</h2>
        <p>
          You keep ownership of everything you upload, post, or submit to the
          Service (your &ldquo;Content&rdquo;), including route logs, grade
          votes, beta spray, crew names, display names, and any other material
          you publish.
        </p>
        <p>
          You grant us a worldwide, non-exclusive, royalty-free licence to
          host, store, reproduce, and display your Content as needed to run
          the Service and show it to the other users you have chosen to share
          it with (for example, your gym&rsquo;s leaderboard or the members of
          a crew you belong to). This licence ends when you delete the
          relevant Content or your account, except where we are legally
          required to retain copies.
        </p>
        <p>
          You are solely responsible for your Content. You confirm you have
          the rights to share it and that it does not violate anyone
          else&rsquo;s rights or these Terms.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>6. Climbing safety</h2>
        <p>
          <strong>
            Chork is a scoring and social tool, not a climbing authority.
          </strong>{" "}
          Bouldering carries real risk of serious injury, including broken
          limbs, head trauma, and death. Using Chork does not change that.
        </p>
        <ul className={styles.list}>
          <li>Climb within your ability and always assess a route before attempting it.</li>
          <li>Make sure the pads, flooring, and spotting conditions are appropriate for what you&rsquo;re trying.</li>
          <li>Follow the rules, instructions, and supervision of the gym you are climbing at.</li>
          <li>If you are new to climbing, get proper instruction from a qualified coach.</li>
        </ul>
        <p>
          Grades, flash bonuses, zone bonuses, leaderboard positions, and
          competition standings displayed on Chork are entertainment and
          progress-tracking features. They are not an endorsement of any
          route&rsquo;s safety, difficulty, or suitability for any individual
          climber.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>7. Gyms and competitions</h2>
        <p>
          Gyms listed on Chork are responsible for the physical climbing
          environment, the routes on their walls, the grades they set, the
          competitions they run, and any fees or membership terms between the
          gym and its climbers. Chork is the software your gym uses; it is not
          the gym.
        </p>
        <p>
          Gym admins and competition organisers are responsible for the
          accuracy of the sets, routes, and events they publish, and for
          complying with all laws applicable to running their events. Climbers
          must still abide by the gym&rsquo;s rules while using Chork on the
          gym&rsquo;s wall.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>8. Availability and changes</h2>
        <p>
          We aim to keep the Service running, but we do not promise
          uninterrupted availability. Features may change, be added, or be
          removed at any time. We may perform maintenance, apply updates, or
          temporarily restrict access without notice where reasonably needed
          to protect the Service or its users.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>9. Pricing</h2>
        <p>
          Access to Chork as a climber is currently free. We may introduce
          paid features or tiers for gyms, organisers, or climbers in the
          future. If we do, we will tell you in advance and you will have the
          chance to review any additional terms before anything is charged.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>10. Termination</h2>
        <p>
          You can delete your account at any time from your profile settings.
          Once deleted, your account and personal data are removed as
          described in our{" "}
          <Link href="/privacy" className={styles.link}>Privacy Policy</Link>.
        </p>
        <p>
          We may suspend or terminate your access to the Service if you break
          these Terms, if required by law, or if it becomes reasonably
          necessary to protect other users or the Service itself. We will
          usually tell you why, but may not do so where that would create a
          legal or security risk.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>11. Intellectual property</h2>
        <p>
          The Chork name, logo, brand mark, software, design, and interface
          are owned by us and protected by copyright, trademark, and other
          intellectual property laws. Nothing in these Terms transfers those
          rights to you. You are granted a limited, personal, non-exclusive,
          non-transferable, revocable licence to use the Service for its
          intended purpose.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>12. Third-party services</h2>
        <p>
          Chork runs on infrastructure provided by third parties, including
          Supabase for database and authentication, and hosting providers for
          compute and storage. Your use of the Service is also subject to
          those providers&rsquo; terms where relevant. We are not responsible
          for third-party services or websites we link to.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>13. Disclaimer</h2>
        <p>
          The Service is provided on an &ldquo;as is&rdquo; and &ldquo;as
          available&rdquo; basis. To the fullest extent permitted by law, we
          disclaim all warranties, express or implied, including but not
          limited to implied warranties of merchantability, fitness for a
          particular purpose, and non-infringement. We do not warrant that the
          Service will be uninterrupted, error-free, secure against every
          attack, or free of inaccuracies in user-submitted Content.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>14. Limitation of liability</h2>
        <p>
          To the fullest extent permitted by law, we will not be liable for
          any indirect, incidental, special, consequential, or punitive
          damages; loss of profits, revenue, goodwill, or data; or personal
          injury arising from the act of climbing (see Section 6).
        </p>
        <p>
          Our total aggregate liability arising out of or relating to the
          Service will not exceed the greater of (a) the fees you have paid
          us for the Service in the twelve (12) months preceding the event
          giving rise to the claim, or (b) £100.
        </p>
        <p>
          Nothing in these Terms limits liability that cannot be limited under
          applicable law, including liability for death or personal injury
          caused by our negligence, or for fraud.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>15. Indemnity</h2>
        <p>
          You agree to indemnify and hold us harmless from any claims,
          liabilities, damages, losses, and expenses (including reasonable
          legal fees) arising out of or connected with your use of the
          Service, your Content, or your breach of these Terms.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>16. Governing law and disputes</h2>
        <p>
          These Terms are governed by the laws of England and Wales. The
          courts of England and Wales have exclusive jurisdiction over any
          dispute arising out of or in connection with these Terms or the
          Service. If you are a consumer in another jurisdiction, nothing in
          this section removes the consumer protection rights you have under
          your local law.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>17. Changes to these terms</h2>
        <p>
          We may update these Terms from time to time. If we make material
          changes, we will update the &ldquo;Last updated&rdquo; date at the
          top of this page and, where practical, notify you in the app or by
          email. Your continued use of the Service after the updated Terms
          take effect means you accept them. If you do not agree, stop using
          the Service and close your account.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>18. Severability and entire agreement</h2>
        <p>
          If any part of these Terms is found to be unenforceable, the rest
          remain in force. These Terms, together with our Privacy Policy,
          form the entire agreement between you and us regarding the Service
          and supersede any prior agreements on the same subject.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>19. Contact</h2>
        <p>
          Questions about these Terms? Get in touch at{" "}
          <Link href="mailto:hi@chork.app" className={styles.link}>
            hi@chork.app
          </Link>
          .
        </p>
      </section>

      <footer className={styles.footer}>
        <Link href="/" className={styles.link}>Back to Chork</Link>
      </footer>
    </main>
  );
}
