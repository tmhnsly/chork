import type { ReactNode } from "react";
import styles from "./deviceFrame.module.scss";

interface Props {
  /** What the picture shows, for anyone who can't see it. */
  label: string;
  children: ReactNode;
  className?: string;
}

/**
 * The marketing page's phone. Its child is ordinary app UI at the
 * width the app runs at on a small phone — real components with
 * fixture data, not a drawing of them.
 *
 * The screen is `inert`: the device is a picture of the app, and a
 * picture has no tab stops, no links and no buttons to press. The
 * frame is the image, and `label` is its alt text.
 */
export function DeviceFrame({ label, children, className }: Props) {
  return (
    <div className={styles.holder}>
      <div className={[styles.frame, className].filter(Boolean).join(" ")} role="img" aria-label={label}>
        <div className={styles.screen} inert>
          {children}
        </div>
      </div>
    </div>
  );
}
