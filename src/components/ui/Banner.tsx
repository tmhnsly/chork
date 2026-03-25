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
  return (
    <div className={`${styles.banner} ${styles[`banner--${variant}`]}`}>
      <span className={styles.bannerIcon}>{icons[variant]}</span>
      <span className={styles.bannerContent}>{children}</span>
    </div>
  );
}
