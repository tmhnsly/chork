"use client";

import styles from "./revealText.module.scss";

interface Props {
  text: string;
  className?: string;
  as?: "h1" | "h2" | "h3" | "p" | "span";
  /** Delay before the reveal begins (seconds) */
  delay?: number;
}

/**
 * Reveals text word-by-word with a staggered slide-up animation.
 * Pure CSS — uses clip-path to mask each word and a keyframe to slide it in.
 */
export function RevealText({ text, className, as: Tag = "h1", delay = 0 }: Props) {
  const words = text.split(" ");

  return (
    <Tag className={className}>
      {words.map((word, i) => (
        <span key={i}>
          <span className={styles.wordClip}>
            <span
              className={styles.word}
              style={{ "--i": i, "--delay": `${delay}s` } as React.CSSProperties}
            >
              {word}
            </span>
          </span>
          {i < words.length - 1 && " "}
        </span>
      ))}
    </Tag>
  );
}
