"use client";

import type { ButtonHTMLAttributes } from "react";
import styles from "./ui.module.scss";

type Variant = "primary" | "secondary" | "ghost" | "danger";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

const variantClass: Record<Variant, string> = {
  primary: styles.btnPrimary,
  secondary: styles.btnSecondary,
  ghost: styles.btnGhost,
  danger: styles.btnDanger,
};

export function Button({ variant = "primary", className, ...props }: Props) {
  const cls = [variantClass[variant], className].filter(Boolean).join(" ");
  return <button className={cls} {...props} />;
}
