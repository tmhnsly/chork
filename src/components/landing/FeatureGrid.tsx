"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import * as VisuallyHidden from "@radix-ui/react-visually-hidden";
import styles from "./featureGrid.module.scss";

export interface FeatureItem {
  icon: ReactNode;
  title: string;
  description: string;
}

interface Props {
  items: FeatureItem[];
}

export function FeatureGrid({ items }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.05 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <section className={styles.section} aria-labelledby="feature-grid-heading">
      {/* Visually-hidden h2 makes the heading order land
          h1 (Hero) → h2 (Features) → h3 (each card) instead of jumping
          h1 → h3, which Lighthouse a11y flags as heading-order. The
          screen-reader landmark name comes from this heading. */}
      <VisuallyHidden.Root asChild>
        <h2 id="feature-grid-heading">Features</h2>
      </VisuallyHidden.Root>
      <div
        ref={ref}
        className={`${styles.grid} ${visible ? styles.gridVisible : ""}`}
      >
        {items.map((item) => (
          <div key={item.title} className={styles.card}>
            <div className={styles.cardHeader}>
              <span className={styles.icon}>{item.icon}</span>
              <h3 className={styles.title}>{item.title}</h3>
            </div>
            <p className={styles.description}>{item.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
