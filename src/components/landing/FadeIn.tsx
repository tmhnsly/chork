"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import styles from "./fadeIn.module.scss";

interface Props {
  children: ReactNode;
  className?: string;
  /** Delay in ms before animation starts after becoming visible */
  delay?: number;
}

export function FadeIn({ children, className, delay = 0 }: Props) {
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
      { threshold: 0.1 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const cls = [
    styles.fadeIn,
    visible ? styles.visible : "",
    className,
  ].filter(Boolean).join(" ");

  return (
    <div
      ref={ref}
      className={cls}
      style={delay ? { "--fade-delay": `${delay}ms` } as React.CSSProperties : undefined}
    >
      {children}
    </div>
  );
}
