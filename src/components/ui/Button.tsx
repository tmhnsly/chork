"use client";

import type { ButtonHTMLAttributes } from "react";
import styles from "./ui.module.scss";

type Variant = "primary" | "secondary" | "ghost" | "danger";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  fullWidth?: boolean;
  flex?: boolean;
}

const variantClass: Record<Variant, string> = {
  primary: styles.btnPrimary,
  secondary: styles.btnSecondary,
  ghost: styles.btnGhost,
  danger: styles.btnDanger,
};

export function Button({ variant = "primary", fullWidth, flex, className, ...props }: Props) {
  const cls = [
    variantClass[variant],
    fullWidth && styles.btnFull,
    flex && styles.btnFlex1,
    className,
  ].filter(Boolean).join(" ");
  return <button className={cls} {...props} />;
}
