"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FaBolt, FaFlag } from "react-icons/fa6";
import styles from "./scoringChart.module.scss";

export interface ScoreRow {
  label: string;
  points: string;
  /** 0..1 normalised bar length relative to the widest row. */
  weight: number;
  accent?: "flash" | "zone";
}

interface Props {
  rows: ScoreRow[];
}

function Row({ row }: { row: ScoreRow }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  const onIntersect = useCallback((entries: IntersectionObserverEntry[]) => {
    if (entries[0].isIntersecting) setVisible(true);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(onIntersect, { threshold: 0.5 });
    observer.observe(el);
    return () => observer.disconnect();
  }, [onIntersect]);

  const rowClass = [
    styles.row,
    row.accent === "flash" ? styles.flashRow : "",
    row.accent === "zone" ? styles.zoneRow : "",
  ].filter(Boolean).join(" ");

  return (
    <div ref={ref} className={rowClass}>
      <span className={styles.label}>
        {row.accent === "flash" && <FaBolt className={styles.icon} aria-hidden />}
        {row.accent === "zone" && <FaFlag className={styles.icon} aria-hidden />}
        {row.label}
      </span>
      <div className={styles.barTrack}>
        <div
          className={`${styles.barFill} ${visible ? styles.barFillVisible : ""}`}
          style={{ "--bar-width": `${row.weight * 100}%` } as React.CSSProperties}
        />
        <span className={styles.points}>{row.points}</span>
      </div>
    </div>
  );
}

/**
 * Shared scoring-bar chart. Extracted from the landing-page hero so
 * the in-app Chorkboard can reuse the same visual language — no more
 * duplicating the same points economy two different ways.
 *
 * Caller supplies the rows (kept serialisable + parameterised so the
 * same primitive can render Flash/Zone accents as needed).
 */
export function ScoringChart({ rows }: Props) {
  return (
    <div className={styles.chart}>
      {rows.map((row) => (
        <Row key={row.label} row={row} />
      ))}
    </div>
  );
}
