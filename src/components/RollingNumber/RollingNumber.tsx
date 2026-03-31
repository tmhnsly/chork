"use client";

import { useState } from "react";
import styles from "./rollingNumber.module.scss";

interface Props {
  value: number;
  className?: string;
}

export function RollingNumber({ value, className }: Props) {
  const [prev, setPrev] = useState(value);
  const [key, setKey] = useState(0);
  const [dir, setDir] = useState<"up" | "down" | null>(null);

  // Detect value change during render — no effect needed
  if (value !== prev) {
    setDir(value > prev ? "up" : "down");
    setPrev(value);
    setKey((k) => k + 1);
  }

  const cls = [
    styles.number,
    dir === "up" ? styles.up : "",
    dir === "down" ? styles.down : "",
    className,
  ].filter(Boolean).join(" ");

  return (
    <span className={styles.container}>
      <span
        key={key}
        className={cls}
        onAnimationEnd={() => setDir(null)}
      >
        {value}
      </span>
    </span>
  );
}
