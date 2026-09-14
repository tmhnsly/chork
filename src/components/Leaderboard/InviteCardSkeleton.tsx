import { shimmerStyles } from "@/components/ui";
import styles from "./inviteCard.module.scss";

/** `InviteCard`, waiting: icon disc, heading and body bars, the CTA's slot. */
export function InviteCardSkeleton() {
  return (
    <section className={styles.card} aria-hidden>
      <span className={`${styles.icon} ${shimmerStyles.skeletonDisc}`} />
      <div className={styles.text}>
        <span className={shimmerStyles.skeletonLine} style={{ "--skeleton-w": "9rem" } as React.CSSProperties} />
        <span className={shimmerStyles.skeletonLine} style={{ "--skeleton-w": "14rem" } as React.CSSProperties} />
      </div>
      <span className={`${styles.cta} ${shimmerStyles.skeleton}`} />
    </section>
  );
}
