"use client";

import { type ReactNode } from "react";
import { motion } from "motion/react";

interface Props {
  children: ReactNode;
  className?: string;
}

/**
 * Wraps page content with a smooth fade-up entrance.
 * Place inside the outermost page element (e.g. <main>).
 */
export function PageTransition({ children, className }: Props) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
    >
      {children}
    </motion.div>
  );
}
