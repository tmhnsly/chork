"use client";

import type { ReactNode } from "react";
import styles from "./heroSection.module.scss";

interface Props {
  headline: string;
  subheadline: string;
  cta: ReactNode;
  /** Optional visual element rendered below the CTA */
  visual?: ReactNode;
}

export function HeroSection({ headline, subheadline, cta, visual }: Props) {
  return (
    <section className={styles.hero}>
      <div className={styles.inner}>
        <h1 className={styles.headline}>{headline}</h1>
        <p className={styles.subheadline}>{subheadline}</p>
        <div className={styles.ctaRow}>{cta}</div>
        {visual && <div className={styles.visual}>{visual}</div>}
      </div>
    </section>
  );
}
