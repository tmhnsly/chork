"use client";

import {
  FaCircleCheck,
  FaCircleExclamation,
  FaCircleInfo,
  FaTriangleExclamation,
} from "react-icons/fa6";
import styles from "./ui.module.scss";

type Variant = "info" | "success" | "warning" | "error";

interface Props {
  variant?: Variant;
  children: React.ReactNode;
}

const icons: Record<Variant, React.ReactNode> = {
  info: <FaCircleInfo />,
  success: <FaCircleCheck />,
  warning: <FaTriangleExclamation />,
  error: <FaCircleExclamation />,
};

export function Banner({ variant = "info", children }: Props) {
  // Announce dynamic banners to AT — assertive for error/warning, polite
  // otherwise. Its main dynamic use (JoinMatchForm's lookup error) was
  // previously silent to screen readers.
  const assertive = variant === "error" || variant === "warning";
  return (
    <div
      className={`${styles.banner} ${styles[`banner--${variant}`]}`}
      role={assertive ? "alert" : "status"}
      aria-live={assertive ? "assertive" : "polite"}
    >
      <span className={styles.bannerIcon}>{icons[variant]}</span>
      <span className={styles.bannerContent}>{children}</span>
    </div>
  );
}
