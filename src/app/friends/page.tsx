import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireSignedIn } from "@/lib/auth";
import { PageHeader, Reveal, Named } from "@/components/motion";
import { FriendSearch } from "@/components/Friends/FriendSearch";
import { FriendsListSkeleton } from "@/components/Friends/FriendsListSkeleton";
import { FriendsContent } from "./FriendsContent";
import styles from "./friends.module.scss";

export const metadata: Metadata = {
  title: "Friends",
  description: "The climbers you compete with.",
};

/**
 * The friends graph. Gymless-safe by design — `requireSignedIn`,
 * never `requireAuth`. The title and the search render instantly;
 * the board, moments and list stream in behind one boundary and
 * reveal over the list's own skeleton — the one section that is
 * always there. A single guessed-height card was tried: it arrived
 * as a tall white block and became a short list, which is the
 * layout jump the reveal exists to avoid.
 */
export default async function FriendsPage() {
  const auth = await requireSignedIn();
  if ("error" in auth) redirect("/login");

  return (
    <main className={styles.page}>
      <PageHeader title="Friends" />
      {/* Above everything: the person you KNOW you know and can't see
          on the list is the most impatient case on this page. */}
      <FriendSearch />
      <Reveal
        fallback={
          <Named name="friends-content" share="reveal">
            <div className={styles.content} role="status" aria-label="Loading friends">
              <FriendsListSkeleton />
            </div>
          </Named>
        }
      >
        <FriendsContent />
      </Reveal>
    </main>
  );
}
