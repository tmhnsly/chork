import { CardSkeleton, PageHeaderSkeleton } from "@/components/ui";
import styles from "./friends.module.scss";

/**
 * Skeleton for `/friends`.
 *
 * Only the roster is reserved. The friends board needs a shared Set
 * *and* someone to share it with, and the moments feed needs a friend
 * who has done something — a climber on their first visit has neither,
 * and that climber is exactly who waits on this page longest. Two
 * empty cards promising content that never arrives is worse than the
 * one shift the people who do have both will see.
 */
export default function FriendsLoading() {
  return (
    <main className={styles.page} aria-busy="true" aria-label="Loading friends">
      <PageHeaderSkeleton subtitle />
      <CardSkeleton height="14rem" ariaLabel="Loading friends" />
    </main>
  );
}
