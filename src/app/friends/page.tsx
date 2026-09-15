import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireSignedIn } from "@/lib/auth";
import { PageHeader, Reveal, Named } from "@/components/motion";
import { CardSkeleton } from "@/components/ui";
import { FriendSearch } from "@/components/Friends/FriendSearch";
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
 * reveal over a single card (Friends is due to become Social; a
 * faithful skeleton of a page about to be replaced is wasted work).
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
            <div className={styles.content} aria-hidden>
              <CardSkeleton height="14rem" ariaLabel="Loading friends" />
            </div>
          </Named>
        }
      >
        <FriendsContent />
      </Reveal>
    </main>
  );
}
