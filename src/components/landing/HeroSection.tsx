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
  return (
    <section className={styles.hero}>
      <div className={styles.inner}>
        <RevealText text={headline} as="h1" className={styles.headline} />
        <p className={styles.subheadline}>{subheadline}</p>
        <div className={styles.ctaRow}>{cta}</div>
        {visual && <div className={styles.visual}>{visual}</div>}
      </div>
    </section>
  );
}
