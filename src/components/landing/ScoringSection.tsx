"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { FaBolt, FaBullseye } from "react-icons/fa6";
import styles from "./scoringSection.module.scss";

interface ScoreRow {
  label: string;
  points: string;
  weight: number;
  accent?: "flash" | "zone";
}

interface Props {
  rows: ScoreRow[];
}

/** Single bar row that animates when it enters the viewport. */
function ScoreBar({ row }: { row: ScoreRow }) {
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
        {row.accent === "flash" && <FaBolt className={styles.icon} />}
        {row.accent === "zone" && <FaBullseye className={styles.icon} />}
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

export function ScoringSection({ rows }: Props) {
  return (
    <section className={styles.section}>
      <div className={styles.inner}>
        <h2 className={styles.heading}>How scoring works</h2>
        <p className={styles.sub}>
          Points are earned per route. The fewer attempts, the higher the score.
        </p>
        <div className={styles.chart}>
          {rows.map((row) => (
            <ScoreBar key={row.label} row={row} />
          ))}
        </div>
      </div>
    </section>
  );
}

export type { ScoreRow };
