import type { Metadata } from "next";
import Link from "next/link";
import { FaUsers } from "react-icons/fa6";
import { redirect } from "next/navigation";
import { requireSignedIn } from "@/lib/auth";
import { PageHeader } from "@/components/motion";
import {
  getFriends,
  getFriendSuggestions,
  getFriendsLeaderboard,
  partitionFriends,
} from "@/lib/data/friend-queries";
import { getServerProfile } from "@/lib/supabase/server";
import { getCurrentSet } from "@/lib/data/set-queries";
import { formatSetLabel } from "@/lib/data/set-label";
import { FriendsBoard } from "@/components/Friends/FriendsBoard";
import { FriendsList } from "@/components/Friends/FriendsList";
import styles from "./friends.module.scss";

export const metadata: Metadata = {
  title: "Friends",
  description: "The climbers you compete with.",
};

/**
 * The friends graph.
 *
 * Gymless-safe by design — `requireSignedIn`, never `requireAuth`.
 * Friends are the part of Chork that works on a home wall or on rock,
 * and gating them on a gym would be exactly backwards for a
 * group-first product.
 */
export default async function FriendsPage() {
  const auth = await requireSignedIn();
  if ("error" in auth) redirect("/login");

  const [friends, suggestions, profile] = await Promise.all([
    getFriends(auth.supabase),
    getFriendSuggestions(auth.supabase),
    getServerProfile(),
  ]);

  const { active, incoming, outgoing } = partitionFriends(friends);

  // The board only means anything where there is a Set to compare on
  // — points don't compare across gyms, and a gymless climber has no
  // Set at all. Friends elsewhere are served by moments, not by this.
  const currentSet = profile?.active_gym_id
    ? await getCurrentSet(profile.active_gym_id)
    : null;
  const board =
    currentSet && active.length > 0
      ? await getFriendsLeaderboard(auth.supabase, currentSet.id)
      : [];

  return (
    <main className={styles.page}>
      <PageHeader
        title="Friends"
        subtitle="The climbers you compete with."
      />
      {currentSet && board.length > 1 && (
        <FriendsBoard rows={board} setLabel={formatSetLabel(currentSet)} />
      )}
      <FriendsList
        active={active}
        incoming={incoming}
        outgoing={outgoing}
        suggestions={suggestions}
      />
      {/* Crews still own the private leaderboard until phase 2 folds
          it in here, so they stay one tap away rather than stranded
          behind a URL. The link goes when the friends board lands. */}
      <Link href="/crew" className={styles.crewLink}>
        <FaUsers aria-hidden /> Your crews
      </Link>
    </main>
  );
}
