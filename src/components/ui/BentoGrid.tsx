import type { ReactNode, HTMLAttributes } from "react";
import styles from "./bento.module.scss";

// ── Grid ───────────────────────────────────────────
type Columns = 2 | 3 | 4;

interface GridProps extends HTMLAttributes<HTMLDivElement> {
  columns?: Columns;
  children: ReactNode;
}

const colClass: Record<Columns, string> = {
  2: styles.cols2,
  3: styles.cols3,
  4: styles.cols4,
};

export function BentoGrid({
  columns = 2,
  className,
  children,
  ...props
}: GridProps) {
  const outerCls = [styles.wrapper, className].filter(Boolean).join(" ");
  const innerCls = [styles.grid, colClass[columns]].filter(Boolean).join(" ");
  return (
    <div className={outerCls} {...props}>
      <div className={innerCls}>{children}</div>
    </div>
  );
}

// ── Cell ───────────────────────────────────────────
type Span = 1 | 2 | 3 | 4 | "full";
type CellVariant = "default" | "accent" | "flash";

interface CellProps extends HTMLAttributes<HTMLDivElement> {
  span?: Span;
  variant?: CellVariant;
  children: ReactNode;
}

const spanClass: Record<string, string> = {
  "1": "",
  "2": styles.span2,
  "3": styles.span3,
  "4": styles.span4,
  full: styles.spanFull,
};

const variantClass: Record<CellVariant, string> = {
  default: "",
  accent: styles.cellAccent,
  flash: styles.cellFlash,
};

export function BentoCell({
  span = 1,
  variant = "default",
  className,
  children,
  ...props
}: CellProps) {
  const cls = [
    styles.cell,
    spanClass[String(span)],
    variantClass[variant],
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={cls} {...props}>
      {children}
    </div>
  );
}

// ── Stat ───────────────────────────────────────────
// Apple Weather-style widget: small icon + label top-left, value bottom-left.
interface StatCellProps {
  label: string;
  value?: string | number;
  icon?: ReactNode;
  span?: Span;
  variant?: CellVariant;
  className?: string;
}

export function BentoStat({
  label,
  value = "-",
  icon,
  span = 1,
  variant = "default",
  className,
}: StatCellProps) {
  return (
    <BentoCell span={span} variant={variant} className={`${styles.statCell} ${className ?? ""}`}>
      <span className={styles.statLabel}>
        {icon && <span className={styles.statIcon}>{icon}</span>}
        {label}
      </span>
      <span className={styles.statValue}>{value}</span>
    </BentoCell>
  );
}
