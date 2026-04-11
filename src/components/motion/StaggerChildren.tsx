"use client";

import { type ReactNode } from "react";
import { motion } from "motion/react";

interface Props {
  children: ReactNode;
  className?: string;
  /** Delay between each child (seconds) */
  stagger?: number;
  /** Initial delay before stagger begins (seconds) */
  delay?: number;
}

const container = {
  hidden: {},
  show: (custom: { stagger: number; delay: number }) => ({
    transition: {
      staggerChildren: custom.stagger,
      delayChildren: custom.delay,
    },
  }),
};

const item = {
  hidden: { opacity: 0, y: 12 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, ease: [0.25, 0.1, 0.25, 1] as const },
  },
};

/**
 * Staggers the entrance of direct children with a fade-up.
 * Each child must be wrapped in <StaggerItem>.
 */
export function StaggerChildren({ children, className, stagger = 0.05, delay = 0 }: Props) {
  return (
    <motion.div
      className={className}
      variants={container}
      initial="hidden"
      animate="show"
      custom={{ stagger, delay }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div className={className} variants={item}>
      {children}
    </motion.div>
  );
}
