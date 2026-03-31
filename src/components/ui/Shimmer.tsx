import type { ReactNode, HTMLAttributes } from "react";
import styles from "./shimmer.module.scss";

interface Props extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

/**
 * Wraps children in a shimmer loading effect.
 * Children are rendered invisibly to preserve their exact layout,
 * and a shimmer overlay covers them. Use this to build loading
 * states from the real component markup with placeholder data —
 * no manual sizing needed.
 */
export function Shimmer({ children, className, ...props }: Props) {
  const cls = [styles.shimmer, className].filter(Boolean).join(" ");
  return (
    <div className={cls} aria-hidden="true" {...props}>
      <div className={styles.content}>{children}</div>
    </div>
  );
}
