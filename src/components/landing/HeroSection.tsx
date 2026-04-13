"use client";

import type { ReactNode } from "react";
import { RevealText } from "@/components/motion";
import styles from "./heroSection.module.scss";

interface Props {
  headline: string;
  subheadline: string;
  cta: ReactNode;
  /** Optional visual element rendered below the CTA */
  visual?: ReactNode;
}

export function HeroSection({ headline, subheadline, cta, visual }: Props) {
  // Split the headline on sentence boundaries so we can render each
  // sentence in its own colour tier — primary text (step 12) for
  // the lead, low-contrast text (step 11) for the follow-up. Falls
  // through cleanly for a single-sentence headline (second tier
  // simply isn't rendered). RevealText splits each half into its
  // own word-clip stagger independently.
  const sentences = splitSentences(headline);

  return (
    <section className={styles.hero}>
      <div className={styles.inner}>
        <h1 className={styles.headline}>
          <span className={styles.headlinePrimary}>
            <RevealText text={sentences[0] ?? headline} as="span" />
          </span>
          {sentences[1] && (
            <>
              {" "}
              <span className={styles.headlineSecondary}>
                <RevealText
                  text={sentences[1]}
                  as="span"
                  delay={0.2}
                />
              </span>
            </>
          )}
        </h1>
        <p className={styles.subheadline}>{subheadline}</p>
        <div className={styles.ctaRow}>{cta}</div>
        {visual && <div className={styles.visual}>{visual}</div>}
      </div>
    </section>
  );
}

function splitSentences(text: string): string[] {
  return text
    .split(/\.(\s|$)/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => `${s}.`);
}
