"use client";

import type { ReactNode } from "react";
import { motion } from "motion/react";
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
        <motion.p
          className={styles.subheadline}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          {subheadline}
        </motion.p>
        <motion.div
          className={styles.ctaRow}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.5 }}
        >
          {cta}
        </motion.div>
        {visual && (
          <motion.div
            className={styles.visual}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.4 }}
          >
            {visual}
          </motion.div>
        )}
      </div>
    </section>
  );
}
