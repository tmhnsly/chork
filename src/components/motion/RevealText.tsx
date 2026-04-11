"use client";

import { motion } from "motion/react";

interface Props {
  text: string;
  className?: string;
  as?: "h1" | "h2" | "h3" | "p" | "span";
  /** Delay before the reveal begins (seconds) */
  delay?: number;
}

/**
 * Reveals text word-by-word with a staggered mask/clip animation.
 * Inspired by motion.dev's text reveal pattern.
 */
export function RevealText({ text, className, as: Tag = "h1", delay = 0 }: Props) {
  const words = text.split(" ");

  return (
    <Tag className={className}>
      {words.map((word, i) => (
        <span key={i} style={{ display: "inline-block", overflow: "hidden", verticalAlign: "top" }}>
          <motion.span
            style={{ display: "inline-block" }}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            transition={{
              duration: 0.5,
              ease: [0.25, 0.1, 0.25, 1],
              delay: delay + i * 0.04,
            }}
          >
            {word}
          </motion.span>
          {i < words.length - 1 && "\u00A0"}
        </span>
      ))}
    </Tag>
  );
}
