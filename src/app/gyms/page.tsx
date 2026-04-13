import Link from "next/link";
import {
  FaArrowRight,
  FaClipboardList,
  FaChartColumn,
  FaUsers,
  FaBell,
  FaCircleNodes,
  FaGear,
} from "react-icons/fa6";
import { RevealText } from "@/components/motion";
import { FadeIn } from "@/components/landing/FadeIn";
import styles from "./gyms.module.scss";

export const metadata = {
  title: "Chork for gyms",
  description:
    "Bring Chork to your gym — set management, climber analytics, and multi-gym competitions. In active development.",
};

interface FeatureRow {
  icon: React.ReactNode;
  title: string;
  description: string;
}

const FEATURES: FeatureRow[] = [
  {
    icon: <FaClipboardList />,
    title: "Set management",
    description:
      "Create, publish, and archive comp sets in a couple of taps. Pick V-scale, Font, or points-only scoring per set. Schedule sets to go live on a date; we handle the flip.",
  },
  {
    icon: <FaChartColumn />,
    title: "Climber engagement analytics",
    description:
      "See the active-climber count, top routes, zone-vs-send ratios, flash leaders, and community grade distribution across every set. Every stat computed server-side — no waiting on dashboards.",
  },
  {
    icon: <FaGear />,
    title: "Route authoring insights",
    description:
      "Attach setter names (internal only) to see whose routes your climbers are engaging with most. Perfect for rotating setters or understanding which styles land with your wall.",
  },
  {
    icon: <FaCircleNodes />,
    title: "Multi-gym competitions",
    description:
      "Run a comp across multiple venues. Unified leaderboard with category filters aggregates across all participating gyms automatically.",
  },
  {
    icon: <FaUsers />,
    title: "Admin + organiser roles",
    description:
      "Invite co-admins to manage the wall. Competition organisers get a separate role so they can run comps across gyms they don't own. Climbers never see internal route or setter data.",
  },
  {
    icon: <FaBell />,
    title: "Push notifications",
    description:
      "When a new set drops, your regulars get a push on their phone. Opt-in only, built on Web Push standards — no app store required.",
  },
];

export default function GymsMarketingPage() {
  return (
    <main className={styles.page}>
      <FadeIn>
        <header className={styles.hero}>
          <span className={styles.statusPill} role="status">
            <span className={styles.statusDot} aria-hidden /> In active development
          </span>
          <RevealText text="Chork for gyms" as="h1" className={styles.title} />
          <p className={styles.lede}>
            A purpose-built competition tracker for bouldering gyms. Manage
            sets, understand your climbers, and run comps across venues —
            without stitching a tool out of spreadsheets and Discord.
          </p>
          <div className={styles.ctaRow}>
            <a
              className={styles.ctaPrimary}
              href="mailto:hi@chork.app?subject=Chork for gyms"
            >
              Get in touch <FaArrowRight aria-hidden />
            </a>
            <Link href="/" className={styles.secondaryLink}>
              See the climber app
            </Link>
          </div>
        </header>
      </FadeIn>

      <FadeIn>
        <section className={styles.featureSection} aria-labelledby="features-heading">
          <header className={styles.sectionHeader}>
            <h2 id="features-heading" className={styles.sectionHeading}>What&apos;s shipping</h2>
            <p className={styles.sectionSub}>
              The admin dashboard is live today. Everything below is either
              shipping now or on the roadmap — drop us a line if there&apos;s a
              feature you&apos;d want to shape.
            </p>
          </header>

          <ul className={styles.featureList}>
            {FEATURES.map((f) => (
              <li key={f.title} className={styles.featureRow}>
                <span className={styles.featureIcon} aria-hidden>{f.icon}</span>
                <div className={styles.featureText}>
                  <h3 className={styles.featureTitle}>{f.title}</h3>
                  <p className={styles.featureBody}>{f.description}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </FadeIn>

      <FadeIn>
        <section className={styles.outroCard}>
          <h2 className={styles.outroHeading}>Want in while we build?</h2>
          <p className={styles.outroBody}>
            We&apos;re onboarding gyms one at a time while the admin surface
            matures. If your gym runs comps — weekly, monthly, seasonal — and
            you&apos;d like early access and direct input into the roadmap,
            say hello.
          </p>
          <a
            className={styles.ctaPrimary}
            href="mailto:hi@chork.app?subject=Early access"
          >
            hi@chork.app <FaArrowRight aria-hidden />
          </a>
        </section>
      </FadeIn>
    </main>
  );
}
