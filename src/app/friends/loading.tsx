import { CardSkeleton, PageHeaderSkeleton } from "@/components/ui";
import { FriendSearch } from "@/components/Friends/FriendSearch";
import styles from "./friends.module.scss";

/**
 * Skeleton for /friends: the header without a subtitle (the page has
 * none), the real search field — it needs no data, so it renders for
 * real and never shifts — and one card for the list. The list block
 * stays generic on purpose: Friends is due to become Social, and a
 * faithful skeleton of a page about to be replaced is wasted work.
 */
export default function FriendsLoading() {
  return (
    <main className={styles.page} aria-busy="true" aria-label="Loading friends">
      <PageHeaderSkeleton />
      <FriendSearch />
      <CardSkeleton height="14rem" ariaLabel="Loading friends" />
    </main>
  );
}
