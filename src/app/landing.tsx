"use client";

import {
  FaClipboardCheck,
  FaBolt,
  FaFlag,
  FaScaleBalanced,
  FaComments,
  FaTrophy,
} from "react-icons/fa6";
import Link from "next/link";
import { Button } from "@/components/ui";
import { HeroSection } from "@/components/landing/HeroSection";
import { HeroGrid } from "@/components/landing/HeroGrid";
import { FeatureGrid } from "@/components/landing/FeatureGrid";
import type { FeatureItem } from "@/components/landing/FeatureGrid";
import { HowItWorksSection } from "@/components/landing/HowItWorksSection";
import type { Step } from "@/components/landing/HowItWorksSection";
import { ScoringSection } from "@/components/landing/ScoringSection";
import type { ScoreRow } from "@/components/landing/ScoringSection";
import { FadeIn } from "@/components/landing/FadeIn";
import styles from "./landing.module.scss";

const features: FeatureItem[] = [
  {
    icon: <FaClipboardCheck />,
    title: "Log your sends",
    description: "Track attempts across sessions. Mark sends when you top out. Your progress, always saved.",
  },
  {
    icon: <FaBolt />,
    title: "Flash detection",
    description: "Send it first try and earn maximum points. Flash badges show everyone you meant business.",
  },
  {
    icon: <FaFlag />,
    title: "Zone holds",
    description: "Reach the crux and earn partial credit. Every zone hold adds a bonus point to your score.",
  },
  {
    icon: <FaScaleBalanced />,
    title: "Community grades",
    description: "Climbers vote on difficulty after sending. The consensus grade is the real grade.",
  },
  {
    icon: <FaComments />,
    title: "Beta spray",
    description: "Send a route, unlock the comments. Share hints with your crew and help others send.",
  },
  {
    icon: <FaTrophy />,
    title: "Leaderboard",
    description: "See where you rank in the current set. Points update live as you and your crew climb.",
  },
];

const steps: Step[] = [
  {
    number: 1,
    title: "Sign in",
    description: "Create an account in seconds. Pick your gym and you're in.",
  },
  {
    number: 2,
    title: "See the current set",
    description: "Your gym's active routes appear as a send grid. Tap any tile to start logging.",
  },
  {
    number: 3,
    title: "Log your attempts",
    description: "Track tries, mark completions, vote on grades. Everything stays between you and the wall.",
  },
  {
    number: 4,
    title: "Share beta",
    description: "Sent a route? Leave hints for your crew. Beta spray is blurred until you send it yourself.",
  },
  {
    number: 5,
    title: "Compete",
    description: "Points accumulate across sends. Flashes and zones earn bonus. Rise up the leaderboard.",
  },
];

const scoreRows: ScoreRow[] = [
  { label: "Flash (1st try)", points: "4 pts", weight: 1, accent: "flash" },
  { label: "2 attempts", points: "3 pts", weight: 0.75 },
  { label: "3 attempts", points: "2 pts", weight: 0.5 },
  { label: "4+ attempts", points: "1 pt", weight: 0.25 },
  { label: "Zone hold", points: "+1 pt", weight: 0.25, accent: "zone" },
];

export function LandingPage() {
  const ctaButton = (
    <Link href="/login">
      <Button>Get started</Button>
    </Link>
  );

  return (
    <div className={styles.page}>
      <HeroSection
        headline="Track your sends. Compete with your crew."
        subheadline="The bouldering comp tracker that keeps score so you can keep climbing."
        cta={ctaButton}
        visual={<HeroGrid />}
      />

      <FeatureGrid items={features} />

      <FadeIn>
        <HowItWorksSection steps={steps} />
      </FadeIn>

      <FadeIn>
        <ScoringSection rows={scoreRows} />
      </FadeIn>

      <FadeIn>
        <section className={styles.ctaSection}>
          <h2 className={styles.ctaHeadline}>Ready to climb?</h2>
          <p className={styles.ctaSub}>
            Join your crew on the wall. It takes ten seconds.
          </p>
          <Link href="/login">
            <Button variant="secondary">Sign up free</Button>
          </Link>
        </section>
      </FadeIn>

      <footer className={styles.footer}>
        <span className={styles.footerName}>Chork</span>
        <span className={styles.footerTagline}>Send it. Log it. Prove it.</span>
        <Link href="/privacy" className={styles.footerLink}>Privacy Policy</Link>
      </footer>
    </div>
  );
}
