import type { ReactNode } from "react";
import { PageTitle } from "./PageTitle";
import styles from "./pageHeader.module.scss";

interface Props {
  title: string;
  /** Optional subtitle rendered below the title in the low-contrast label style. */
  subtitle?: ReactNode;
  as?: "h1" | "h2";
}

/**
 * Shared page-level header. Pairs `PageTitle` (with its reveal
 * animation) with an optional subtitle and applies the canonical
 * spacing between title and the first piece of page content.
 *
 * Every primary page should use this so the distance from "The Wall"
 * / "Chork Board" / "Profile" to the first widget is identical —
 * no one-off header blocks with their own gap values.
 */
export function PageHeader({ title, subtitle, as = "h1" }: Props) {
  return (
    <header className={styles.header}>
      <PageTitle text={title} as={as} className={styles.title} />
      {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
    </header>
  );
}
