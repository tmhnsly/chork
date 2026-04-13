import type { ReactNode } from "react";
import { SectionCard } from "@/components/ui/SectionCard";
import styles from "./widgetCard.module.scss";

interface Props {
  title: string;
  subtitle?: string;
  /** Optional icon left of the title. */
  icon?: ReactNode;
  /** Right-aligned slot — typically a switcher (metric toggle etc.). */
  actions?: ReactNode;
  children: ReactNode;
  /** Empty-state message when the widget has no rows to show. */
  empty?: boolean;
  emptyMessage?: string;
}

/**
 * Dashboard widget shell. A thin wrapper over `SectionCard` so every
 * admin widget inherits the same card surface, title/icon treatment
 * and right-hand meta slot as the rest of the app. Keeps a dedicated
 * name because widgets also support an `empty` short-circuit for the
 * no-data state — consumers don't want to branch at every call site.
 */
export function WidgetCard({
  title,
  subtitle,
  icon,
  actions,
  children,
  empty,
  emptyMessage,
}: Props) {
  return (
    <SectionCard title={title} icon={icon} subtitle={subtitle} meta={actions}>
      {empty ? (
        <p className={styles.empty}>{emptyMessage ?? "No data yet."}</p>
      ) : (
        children
      )}
    </SectionCard>
  );
}
