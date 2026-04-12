"use client";

import styles from "./revealText.module.scss";

interface Props {
  text: string;
  className?: string;
  as?: "h1" | "h2" | "h3" | "p" | "span";
  /** Delay before the reveal begins (seconds) */
  delay?: number;
  /** Characters that act as word dividers for stagger (default: spaces and underscores) */
  dividers?: string;
}

/**
 * Reveals text segment-by-segment with a staggered slide-up animation.
 * Pure CSS — uses clip-path to mask each segment and a keyframe to slide it in.
 *
 * Splits on spaces and divider characters (default: `_`).
 * Dividers are kept attached to the following segment so they render inline.
 * Example: "@slab_slob" → ["@", "slab_", "slob"]
 */
export function RevealText({ text, className, as: Tag = "h1", delay = 0, dividers = "_" }: Props) {
  const segments = splitSegments(text, dividers);

  return (
    <Tag className={className}>
      {segments.map((segment, i) => (
        <span key={i}>
          <span className={styles.wordClip}>
            <span
              className={styles.word}
              style={{ "--i": i, "--delay": `${delay}s` } as React.CSSProperties}
            >
              {segment.text}
            </span>
          </span>
          {segment.trailing}
        </span>
      ))}
    </Tag>
  );
}

interface Segment {
  text: string;
  /** Whitespace after this segment (preserved for layout) */
  trailing: string;
}

/** Split text into animated segments on spaces and divider characters. */
function splitSegments(text: string, dividers: string): Segment[] {
  const results: Segment[] = [];
  // Build regex: split on spaces or before/after divider chars
  // e.g. "@slab_slob" → ["@", "slab", "_", "slob"]
  const escaped = dividers.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`([${escaped}@])| +`, "g");

  // Split and keep delimiters
  const parts = text.split(pattern).filter((p) => p !== undefined && p !== "");

  let i = 0;
  while (i < parts.length) {
    const part = parts[i];

    if (part.match(/^ +$/)) {
      // Whitespace — attach as trailing to previous segment
      if (results.length > 0) {
        results[results.length - 1].trailing = part;
      }
      i++;
      continue;
    }

    results.push({ text: part, trailing: "" });
    i++;
  }

  return results;
}
