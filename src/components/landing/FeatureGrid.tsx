"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
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
    <section className={styles.section}>
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
