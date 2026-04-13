import type { ReactNode } from "react";
import styles from "./sectionCard.module.scss";

interface Props {
  /** Title in the top-left of the header (e.g. "Current Set"). */
  title: ReactNode;
  /** Optional icon rendered to the left of the title. */
  icon?: ReactNode;
  /** Optional one-line helper underneath the title. */
  subtitle?: ReactNode;
  /** Optional right-aligned meta / actions slot (reset date, switcher, etc.). */
  meta?: ReactNode;
  children: ReactNode;
  className?: string;
}

/**
 * Shared card shell with a consistent header: icon + title on the
 * left, optional meta on the right. Body below. Any stat / info /
 * widget card should use this so the visual language stays uniform.
 */
export function SectionCard({ title, icon, subtitle, meta, children, className }: Props) {
  return (
    <section className={`${styles.card} ${className ?? ""}`}>
      <header className={styles.header}>
        <div className={styles.titleGroup}>
          <span className={styles.titleRow}>
            {icon && <span className={styles.icon} aria-hidden>{icon}</span>}
            <span className={styles.title}>{title}</span>
          </span>
          {subtitle && <span className={styles.subtitle}>{subtitle}</span>}
        </div>
        {meta && <span className={styles.meta}>{meta}</span>}
      </header>
      <div className={styles.body}>{children}</div>
    </section>
  );
}
