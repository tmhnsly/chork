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
 * Splits on spaces and divider characters (default: `_`), with the
 * divider kept on the END of the segment before it.
 * Example: "@slab_slob" → ["@slab_", "slob"]
 *
 * Each segment is its own inline-block, so segment boundaries are also
 * the only places a line may break. That makes the split a layout
 * decision as much as an animation one, and it must match the rule
 * `usernameChunks` uses in `src/lib/data/username-display.ts` — the
 * profile header renders a handle through here while every other
 * surface renders it through `<Username>`, and one handle should not
 * break two different ways depending on which screen you're on.
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

/**
 * Split text into animated segments on spaces and divider characters.
 *
 * Matching, rather than splitting on a delimiter, is what keeps the
 * divider attached to the segment before it. A previous version split
 * on `[_@]` and kept the delimiters as segments of their own, which
 * made both the `@` and the `_` free-standing inline-blocks: at 280px
 * a handle with no underscore rendered "@" alone on the first line,
 * and an underscored one could stand a bare "_" on a line by itself.
 * The `@` is no longer a boundary at all, and a divider run ends the
 * segment it belongs to — a line ending "@emil_" reads as continuing,
 * where "@emil" looks like the whole handle.
 */
export function splitSegments(text: string, dividers = "_"): Segment[] {
  const results: Segment[] = [];
  const escaped = dividers.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Three alternatives, in order: a run up to and including its
  // trailing divider(s), a run with no divider, or whitespace. The
  // whitespace branch matters — without it spaces are dropped and
  // multi-word titles like "The Wall" collapse to "TheWall".
  const pattern = new RegExp(`[^ ${escaped}]*[${escaped}]+|[^ ${escaped}]+| +`, "g");

  for (const [part] of text.matchAll(pattern)) {
    if (/^ +$/.test(part)) {
      // Whitespace — attach as trailing to the previous segment so it
      // survives into the render.
      if (results.length > 0) {
        results[results.length - 1].trailing += part;
      }
      continue;
    }

    results.push({ text: part, trailing: "" });
  }

  return results;
}
