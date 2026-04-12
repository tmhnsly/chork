import type { ReactNode } from "react";
import styles from "./widgetCard.module.scss";

interface Props {
  title: string;
  subtitle?: string;
  /** Right-aligned slot — typically a switcher (metric toggle etc.) */
  actions?: ReactNode;
  children: ReactNode;
  /** Empty-state message when the widget has no rows to show. */
  empty?: boolean;
  emptyMessage?: string;
}

/**
 * Shared dashboard-widget shell. One visual pattern across every
 * widget — same card surface, same heading typography, same slot for
 * right-aligned controls — so the dashboard reads as a single instrument
 * cluster instead of a scrapbook.
 */
export function WidgetCard({
  title,
  subtitle,
  actions,
  children,
  empty,
  emptyMessage,
}: Props) {
  return (
    <section className={styles.card}>
      <header className={styles.header}>
        <div className={styles.headerText}>
          <h3 className={styles.title}>{title}</h3>
          {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
        </div>
        {actions && <div className={styles.actions}>{actions}</div>}
      </header>
      {empty ? (
        <p className={styles.empty}>{emptyMessage ?? "No data yet."}</p>
      ) : (
        children
      )}
    </section>
  );
}
