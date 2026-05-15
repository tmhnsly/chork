"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Class always applied (e.g. the grid base). */
  baseClass: string;
  /** Class added once the element scrolls into view. */
  visibleClass: string;
  /** IntersectionObserver threshold. */
  threshold?: number;
}

export function InView({ children, baseClass, visibleClass, threshold = 0.05 }: Props) {
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
      { threshold },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold]);

  return (
    <div
      ref={ref}
      className={visible ? `${baseClass} ${visibleClass}` : baseClass}
    >
      {children}
    </div>
  );
}
