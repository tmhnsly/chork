"use client";

import toast, { Toaster as HotToaster } from "react-hot-toast";
import {
  FaCircleCheck,
  FaCircleExclamation,
  FaCircleInfo,
  FaTriangleExclamation,
} from "react-icons/fa6";
import styles from "./toast.module.scss";

type Variant = "info" | "success" | "warning" | "error";

const icons: Record<Variant, React.ReactNode> = {
  info: <FaCircleInfo />,
  success: <FaCircleCheck />,
  warning: <FaTriangleExclamation />,
  error: <FaCircleExclamation />,
};

/**
 * Show a styled toast notification.
 *
 * Usage:
 *   showToast("Profile updated");
 *   showToast("Something went wrong", "error");
 *   showToast("Check your email", "info");
 */
export function showToast(message: string, variant: Variant = "success") {
  toast.custom(
    (t) => (
      <div
        role={variant === "error" || variant === "warning" ? "alert" : "status"}
        aria-live={variant === "error" || variant === "warning" ? "assertive" : "polite"}
        aria-atomic="true"
        className={`${styles.toast} ${styles[`toast--${variant}`]} ${
          t.visible ? styles.enter : styles.exit
        }`}
      >
        <span className={styles.icon}>{icons[variant]}</span>
        <span className={styles.message}>{message}</span>
      </div>
    ),
    { duration: variant === "error" ? 5000 : 3000 }
  );
}

/** Place once in providers.tsx */
export function ToastProvider() {
  return (
    <HotToaster
      position="top-center"
      toastOptions={{ custom: { duration: 3000 } }}
    />
  );
}
