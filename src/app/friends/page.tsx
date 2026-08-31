import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireSignedIn } from "@/lib/auth";
import { PageHeader } from "@/components/motion";
import {
  getFriends,
  getFriendSuggestions,
  getFriendsLeaderboard,
  getFriendMoments,
  partitionFriends,
} from "@/lib/data/friend-queries";
import { getServerProfile } from "@/lib/supabase/server";
import { getCurrentSet } from "@/lib/data/set-queries";
import { formatSetLabel } from "@/lib/data/set-label";
import { FriendsBoard } from "@/components/Friends/FriendsBoard";
import { MomentsFeed } from "@/components/Friends/MomentsFeed";
import { FriendSearch } from "@/components/Friends/FriendSearch";
import { FriendsList } from "@/components/Friends/FriendsList";
import { SectionNotifications } from "@/components/Notifications/SectionNotifications";
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

  const [friends, suggestions, profile, moments] = await Promise.all([
    getFriends(auth.supabase),
    getFriendSuggestions(auth.supabase),
    getServerProfile(),
    getFriendMoments(auth.supabase),
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
      {/* Above everything: the person you KNOW you know and can't see
          on the list is the most impatient case on this page. */}
      <FriendSearch />
      {currentSet && board.length > 1 && (
        <FriendsBoard rows={board} setLabel={formatSetLabel(currentSet)} />
      )}
      {/* Below the board deliberately. If you share a Set with someone
          the board is the better answer; moments are what you get for
          the friends you don't. */}
      <MomentsFeed moments={moments} />
      {/* This section's slice of the Notification log — requests
          received/accepted surface where they're acted on, and only
          these kinds get read-flagged by the visit. */}
      <SectionNotifications section="friends" />
      <FriendsList
        active={active}
        incoming={incoming}
        outgoing={outgoing}
        suggestions={suggestions}
      />
    </main>
  );
}
