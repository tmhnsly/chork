import type { ReactNode } from "react";
import { PageTitle } from "./PageTitle";
import styles from "./pageHeader.module.scss";

/**
 * Size variants:
 *   "md" (default) — clamped 2xl→4xl, the canonical in-app heading
 *                    for leaderboard / profile / crew / gyms etc.
 *   "lg"           — full display preset (5xl), for pages that want
 *                    the landing-style flourish (privacy splash,
 *                    onboarding intros). Kept inside the same
 *                    component so future size tweaks happen in one
 *                    place instead of sprinkled `.title` rules.
 *
 * Intentionally not covering: login / 404 / global error / landing
 * hero — those have bespoke layouts and stay outside the primitive
 * to avoid forcing one-off exceptions into the shared component.
 */
type Size = "md" | "lg";

interface Props {
  title: string;
  /** Optional subtitle rendered below the title in the low-contrast label style. */
  subtitle?: ReactNode;
  as?: "h1" | "h2";
  size?: Size;
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
export function PageHeader({ title, subtitle, as = "h1", size = "md" }: Props) {
  const titleClass = [styles.title, size === "lg" ? styles.titleLg : ""]
    .filter(Boolean)
    .join(" ");
  return (
    <header className={styles.header}>
      <PageTitle text={title} as={as} className={titleClass} />
      {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
    </header>
  );
}
