"use client";

import type { ReactNode } from "react";
import { FaChevronDown } from "react-icons/fa6";
import styles from "./heroSection.module.scss";

interface Props {
  headline: string;
  subheadline: string;
  cta: ReactNode;
  /** Show a scroll-down arrow at the bottom of the hero */
  scrollHint?: boolean;
}

export function HeroSection({ headline, subheadline, cta, scrollHint }: Props) {
  return (
    <section className={styles.hero}>
      <div className={styles.content}>
        <h1 className={styles.headline}>{headline}</h1>
        <p className={styles.subheadline}>{subheadline}</p>
        <div className={styles.ctaRow}>{cta}</div>
      </div>

      {scrollHint && (
        <div className={styles.scrollHint}>
          <FaChevronDown />
        </div>
      )}
    </section>
  );
}
