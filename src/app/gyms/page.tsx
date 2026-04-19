import Link from "next/link";
import { FaArrowRight } from "react-icons/fa6";
import { RevealText } from "@/components/motion";
import { FadeIn } from "@/components/landing/FadeIn";
import { SiteFooter } from "@/components/landing/SiteFooter";
import styles from "./gyms.module.scss";

export const metadata = {
  title: "Chork for gyms",
  description:
    "The bouldering comp tracker built for gyms — publish sets in two minutes, run comps across venues, keep your regulars showing up for a live leaderboard.",
};

interface Benefit {
  number: string;
  title: string;
  body: string;
}

const BENEFITS: Benefit[] = [
  {
    number: "01",
    title: "Your regulars come back for the board.",
    body: "Every send earns points. Flashes earn bonus. Zone holds earn bonus. Your gym-wide leaderboard refreshes on every send and resets with every new set, so the same climbers never sit on top all year. Casual members turn into regulars when Wednesday night feels like a mini comp.",
  },
  {
    number: "02",
    title: "Publish a set in two minutes.",
    body: "Draft, schedule, publish. Each set picks its own grading scale: V, Font, or raw points. Route grades settle themselves as climbers vote after sending. Archived sets stay searchable, so every problem you've put on the wall is there when you want to look back.",
  },
  {
    number: "03",
    title: "Run comps people turn up for.",
    body: "Single gym, multi-gym, category-filtered. Chork handles the scoreboard and the live scoring. You handle the event. Visiting comp organisers get their own role so they can run an event at your gym without admin access.",
  },
];

interface Value {
  title: string;
  body: string;
}

const VALUES: Value[] = [
  {
    title: "Nothing to install.",
    body: "Chork lives on the web. Climbers open the URL and start logging sends right away. If they want an icon on their home screen, Android prompts them after a few visits and iOS takes a couple of taps from the share sheet. Either way, it's the same app.",
  },
  {
    title: "Climbers don't pay a cent.",
    body: "Every member, drop-in and first-timer gets the full Chork experience after a quick email signup. No subscription, no trial, no upsell. Their wallet stays in the changing room.",
  },
  {
    title: "Setting that fits how your setters work.",
    body: "Pick V-scale, Font, or a points system for each set. Draft the routes ahead of time, schedule the live date, then hit publish. The admin editor was built for setters, not spreadsheets.",
  },
  {
    title: "Real numbers on your wall.",
    body: "See which routes are getting flashed, which ones nobody touches, and how your setters' grades land versus what climbers vote. Useful signals about your wall, not charts for the sake of charts.",
  },
  {
    title: "Competitions built in.",
    body: "Run weekly sprints, seasonal ladders, or multi-gym events. Chork handles the scoreboard and the live scoring. You handle the event. Visiting organisers get their own role so they can run a comp at your gym without admin access.",
  },
  {
    title: "Crews that keep regulars coming back.",
    body: "Climbers form small private groups with shared leaderboards. Mates chase each other up the board all week, and your regulars show up more often because their crew has been posting sends.",
  },
];

interface Step {
  number: string;
  title: string;
  body: string;
}

const STEPS: Step[] = [
  {
    number: "01",
    title: "Talk to us.",
    body: "Drop a line. We chat about your wall, your community, your comp schedule. Half an hour, tops.",
  },
  {
    number: "02",
    title: "Claim your gym.",
    body: "We list you in the gym picker. Your climbers find you. Your admins get the dashboard, set editor, and analytics.",
  },
  {
    number: "03",
    title: "Publish your first set.",
    body: "Pick a grading scale. Draft the routes. Hit publish. Climbers start logging sends the same day.",
  },
  {
    number: "04",
    title: "Read the room.",
    body: "Dashboards light up as climbers move on the wall. See flash leaders, community grades, which routes are getting loved.",
  },
];

export default function GymsMarketingPage() {
  return (
    <main className={styles.page}>
      <FadeIn>
        <header className={styles.hero}>
          <span className={styles.eyebrow}>Chork for gyms</span>
          <h1 className={styles.title}>
            <span className={styles.titlePrimary}>
              <RevealText text="A live board." as="span" />
            </span>{" "}
            <span className={styles.titleAccent}>
              <RevealText text="Every session" as="span" delay={0.2} />
              <span className={styles.dot} aria-hidden="true" />
            </span>
          </h1>
          <p className={styles.lede}>
            Chork is the bouldering comp tracker built for gyms. Publish a set
            in two minutes. Run comps across venues. Keep your regulars
            showing up for a leaderboard that refreshes on every send.
          </p>
          <div className={styles.ctaRow}>
            <a
              className={styles.ctaPrimary}
              href="mailto:hello@chork.app?subject=Chork for gyms"
            >
              Bring Chork to your gym <FaArrowRight aria-hidden />
            </a>
            <Link href="/" className={styles.secondaryLink}>
              See the climber app
            </Link>
          </div>
        </header>
      </FadeIn>

      <FadeIn>
        <section
          className={styles.benefits}
          aria-labelledby="benefits-heading"
        >
          <h2 id="benefits-heading" className={styles.sectionEyebrow}>
            Why gyms use Chork
          </h2>
          <ol className={styles.benefitsList}>
            {BENEFITS.map((b) => (
              <li key={b.number} className={styles.benefitRow}>
                <span className={styles.benefitNumber} aria-hidden>
                  {b.number}
                </span>
                <div className={styles.benefitText}>
                  <h3 className={styles.benefitTitle}>{b.title}</h3>
                  <p className={styles.benefitBody}>{b.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </FadeIn>

      <FadeIn>
        <section className={styles.manifesto} aria-label="How Chork is different">
          <p className={styles.manifestoText}>
            <span className={styles.manifestoLine}>No app store.</span>
            <span className={styles.manifestoLine}>No per-climber fees.</span>
            <span className={styles.manifestoLine}>No spreadsheets.</span>
            <span className={`${styles.manifestoLine} ${styles.manifestoLineAccent}`}>
              No lock-in.
            </span>
          </p>
        </section>
      </FadeIn>

      <FadeIn>
        <section
          className={styles.values}
          aria-labelledby="values-heading"
        >
          <header className={styles.valuesHead}>
            <h2 id="values-heading" className={styles.sectionEyebrow}>
              What gym owners get
            </h2>
            <p className={styles.valuesLede}>
              Every surface, climber and admin, designed by people who climb
              at the gyms they&apos;re building for.
            </p>
          </header>

          <div className={styles.valuesGrid}>
            {VALUES.map((v) => (
              <article key={v.title} className={styles.valueCard}>
                <h3 className={styles.valueTitle}>{v.title}</h3>
                <p className={styles.valueBody}>{v.body}</p>
              </article>
            ))}
          </div>
        </section>
      </FadeIn>

      <FadeIn>
        <section
          className={styles.process}
          aria-labelledby="process-heading"
        >
          <header className={styles.processHead}>
            <h2 id="process-heading" className={styles.sectionEyebrow}>
              Setup in four steps
            </h2>
            <p className={styles.processLede}>
              Most gyms are live with their first set inside a week.
            </p>
          </header>
          <ol className={styles.processList}>
            {STEPS.map((s) => (
              <li key={s.number} className={styles.processStep}>
                <span className={styles.processNumber} aria-hidden>
                  {s.number}
                </span>
                <h3 className={styles.processTitle}>{s.title}</h3>
                <p className={styles.processBody}>{s.body}</p>
              </li>
            ))}
          </ol>
        </section>
      </FadeIn>

      <section className={styles.finalCta} aria-labelledby="final-cta-heading">
        <h2 id="final-cta-heading" className={styles.finalCtaHeading}>
          Ready to put your wall on the board?
        </h2>
        <p className={styles.finalCtaBody}>
          Get in touch. We&apos;ll set you up this week.
        </p>
        <a
          className={styles.finalCtaButton}
          href="mailto:hello@chork.app?subject=Chork for gyms"
        >
          hello@chork.app <FaArrowRight aria-hidden />
        </a>
      </section>

      <SiteFooter />
    </main>
  );
}
