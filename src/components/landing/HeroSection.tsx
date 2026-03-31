"use client";

import type { ReactNode } from "react";
import { FaChevronDown } from "react-icons/fa6";
import styles from "./heroSection.module.scss";

interface Props {
  headline: string;
  subheadline: string;
  cta: ReactNode;
  /** Optional visual element shown alongside the text */
  visual?: ReactNode;
  /** Show a scroll-down arrow at the bottom of the hero */
  scrollHint?: boolean;
}

export function HeroSection({ headline, subheadline, cta, visual, scrollHint }: Props) {
  return (
    <section className={styles.hero}>
      <div className={visual ? styles.split : styles.content}>
        {visual && (
          <div className={styles.visualZone}>{visual}</div>
        )}
        <div className={styles.textZone}>
          <h1 className={styles.headline}>{headline}</h1>
          <p className={styles.subheadline}>{subheadline}</p>
          <div className={styles.ctaRow}>{cta}</div>
        </div>
      </div>

      {scrollHint && (
        <div className={styles.scrollHint}>
          <FaChevronDown />
        </div>
      )}
    </section>
  );
}
