"use client";

import { useState, useRef } from "react";
import type { ReactNode } from "react";
import styles from "./statsTabs.module.scss";

interface Tab {
  label: string;
  content: ReactNode;
}

interface Props {
  tabs: Tab[];
}

const SWIPE_THRESHOLD = 50;

export function StatsTabs({ tabs }: Props) {
  const [activeIndex, setActiveIndex] = useState(0);
  const touchRef = useRef<{ startX: number; startTime: number } | null>(null);

  function handleTouchStart(e: React.TouchEvent) {
    touchRef.current = { startX: e.touches[0].clientX, startTime: Date.now() };
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (!touchRef.current) return;
    const dx = e.changedTouches[0].clientX - touchRef.current.startX;
    const elapsed = Date.now() - touchRef.current.startTime;
    const velocity = Math.abs(dx) / elapsed;
    touchRef.current = null;

    if (Math.abs(dx) > SWIPE_THRESHOLD || velocity > 0.3) {
      if (dx < 0 && activeIndex < tabs.length - 1) {
        setActiveIndex(activeIndex + 1);
      } else if (dx > 0 && activeIndex > 0) {
        setActiveIndex(activeIndex - 1);
      }
    }
  }

  return (
    <div className={styles.container}>
      {/* Pill tab switcher */}
      <div className={styles.tabBar}>
        {tabs.map((tab, i) => (
          <button
            key={i}
            type="button"
            className={`${styles.tabBtn} ${i === activeIndex ? styles.tabBtnActive : ""}`}
            onClick={() => setActiveIndex(i)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Swipeable panels */}
      <div
        className={styles.track}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        style={{ "--active": activeIndex } as React.CSSProperties}
      >
        {tabs.map((tab, i) => (
          <div key={i} className={styles.panel}>
            {tab.content}
          </div>
        ))}
      </div>

      {/* Dot indicators */}
      {tabs.length > 1 && (
        <div className={styles.dots}>
          {tabs.map((_, i) => (
            <div key={i} className={`${styles.dot} ${i === activeIndex ? styles.dotActive : ""}`} />
          ))}
        </div>
      )}
    </div>
  );
}
