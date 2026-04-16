"use client";

import toast, { Toaster as HotToaster } from "react-hot-toast";
import {
  FaCircleCheck,
  FaCircleExclamation,
  FaCircleInfo,
  FaTriangleExclamation,
  FaTrophy,
} from "react-icons/fa6";
import { ICON_MAP } from "@/lib/badge-icons";
import type { BadgeDefinition, BadgeCategory, BadgeIcon } from "@/lib/badges";
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

// Match BadgeShelf's earnedFamily(badge) so the toast's tint mirrors
// the colour family the achievement reads as in the shelf — flash
// earns get amber, zone earns get teal, everything else accent lime.
function familyFor(badge: { category: BadgeCategory; icon: BadgeIcon }): "accent" | "flash" | "success" {
  if (badge.category === "flashes") return "flash";
  if (badge.icon === "flag") return "success";
  return "accent";
}

/**
 * Rich toast for a freshly-earned achievement. Larger footprint than
 * the standard variant — icon medallion on the left, "Achievement
 * unlocked" eyebrow + name + criteria on the right. Family-tinted to
 * match how the same badge renders in the shelf.
 *
 * Stays on screen longer than the default success toast (5s) so the
 * climber gets a beat to read the criteria before it dismisses.
 */
export function showAchievementToast(badge: BadgeDefinition) {
  const Icon = ICON_MAP[badge.icon] ?? FaTrophy;
  const family = familyFor(badge);

  toast.custom(
    (t) => (
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className={`${styles.toast} ${styles.achievement} ${styles[`achievement--${family}`]} ${
          t.visible ? styles.enter : styles.exit
        }`}
      >
        <span className={styles.achievementMedallion} aria-hidden>
          <Icon />
        </span>
        <span className={styles.achievementBody}>
          <span className={styles.achievementEyebrow}>Achievement unlocked</span>
          <span className={styles.achievementName}>{badge.name}</span>
          <span className={styles.achievementCriteria}>{badge.description}</span>
        </span>
      </div>
    ),
    { duration: 5000 }
  );
}

/** Place once in providers.tsx */
export function ToastProvider() {
  return (
    <HotToaster
      position="top-center"
      // iOS notch / Dynamic Island would otherwise cover the toast
      // entirely on the standalone PWA. The 16px floor matches the
      // default vertical breathing room on non-notched devices.
      containerStyle={{
        top: "max(env(safe-area-inset-top, 0px), 16px)",
      }}
      toastOptions={{ custom: { duration: 3000 } }}
    />
  );
}
