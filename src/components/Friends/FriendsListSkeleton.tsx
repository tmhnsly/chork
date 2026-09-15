import { ClimberRowSkeleton } from "@/components/ui/ClimberRow/ClimberRowSkeleton";
import { shimmerStyles } from "@/components/ui/Shimmer";
import styles from "./friendsList.module.scss";

/**
 * `FriendsList`, waiting: one section on the list's own stylesheet —
 * a heading bar and three rows. The board and the moments above it
 * come and go with the data, so they reserve nothing; the list is
 * the one part of the page that is always there.
 */
export function FriendsListSkeleton() {
  return (
    <div className={styles.stack} aria-hidden>
      <section className={styles.section}>
        <span className={shimmerStyles.skeletonLine} style={{ "--skeleton-w": "5rem" } as React.CSSProperties} />
        <ul className={styles.list}>
          <li><ClimberRowSkeleton /></li>
          <li><ClimberRowSkeleton /></li>
          <li><ClimberRowSkeleton /></li>
        </ul>
      </section>
    </div>
  );
}
