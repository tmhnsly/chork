"use client";

import type { InputHTMLAttributes } from "react";
import styles from "./ui.module.scss";

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

export function FormField({ label, error, id, ...inputProps }: Props) {
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      <input id={id} className={styles.input} {...inputProps} />
      {error && <span className={styles.fieldError}>{error}</span>}
    </div>
  );
}
