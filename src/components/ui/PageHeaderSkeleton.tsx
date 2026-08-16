import styles from "./pageHeaderSkeleton.module.scss";
import { shimmerStyles } from "./Shimmer";

interface Props {
  /**
   * Reserve the subtitle line. Set it when the real page passes a
   * `subtitle` to `PageHeader` — otherwise the header is a rung
   * shorter while loading and the whole page slides up on hydration.
   */
  subtitle?: boolean;
}

/**
 * The loading twin of `motion/PageHeader`.
 *
 * Three `loading.tsx` files were each measuring the title by hand, and
 * a header's height is not a number worth re-deriving: it is a clamp
 * against the page's content width, so a hardcoded `40%` was only ever
 * right at one viewport. This tracks the real rules instead — same
 * clamp, same stack gap — and the aria label lives here too, so a
 * screen reader hears the page name rather than "loading" three times.
 */
export function PageHeaderSkeleton({ subtitle = false }: Props) {
  return (
    <header className={styles.header} aria-hidden>
      <div className={`${styles.title} ${shimmerStyles.skeleton}`} />
      {subtitle && (
        <div className={`${styles.subtitle} ${shimmerStyles.skeleton}`} />
      )}
    </header>
  );
}
