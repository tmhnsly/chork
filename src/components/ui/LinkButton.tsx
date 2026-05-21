import type { AnchorHTMLAttributes } from "react";
import Link from "next/link";
import styles from "./ui.module.scss";

type Variant = "primary" | "secondary" | "ghost" | "danger";

interface Props extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> {
  href: string;
  variant?: Variant;
  fullWidth?: boolean;
  flex?: boolean;
}

const variantClass: Record<Variant, string> = {
  primary: styles.btnPrimary,
  secondary: styles.btnSecondary,
  ghost: styles.btnGhost,
  danger: styles.btnDanger,
};

/**
 * Link-styled-as-Button. Renders a `next/link` `<Link>` with the same
 * variant classes as `<Button>` so click-to-navigate CTAs look and
 * behave identically to action buttons while keeping anchor semantics
 * (right-click menu, middle-click new tab, hover preview, AT
 * announcement as "link" not "button").
 *
 * Use for any "go somewhere" CTA. Use `<Button>` for "do something".
 *
 * Reuses `ui.module.scss` button classes — hover, focus, disabled,
 * theme accent all stay in lockstep with `<Button>`. Don't re-roll
 * styling on `<Link>` directly; reach for this primitive instead.
 */
export function LinkButton({
  variant = "primary",
  fullWidth,
  flex,
  className,
  href,
  ...props
}: Props) {
  const cls = [
    variantClass[variant],
    fullWidth && styles.btnFull,
    flex && styles.btnFlex1,
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return <Link href={href} className={cls} {...props} />;
}
