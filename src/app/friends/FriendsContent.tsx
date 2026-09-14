import { requireSignedIn } from "@/lib/auth";
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
import { FriendsList } from "@/components/Friends/FriendsList";
import styles from "./friends.module.scss";

/** Everything on /friends that needs data, streamed as one block. */
export async function FriendsContent() {
  const auth = await requireSignedIn();
  if ("error" in auth) return null;

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
    <div className={styles.content} data-vt="friends-content">
      {currentSet && board.length > 1 && (
        <FriendsBoard rows={board} setLabel={formatSetLabel(currentSet)} />
      )}
      {/* Below the board deliberately. If you share a Set with someone
          the board is the better answer; moments are what you get for
          the friends you don't. */}
      <MomentsFeed moments={moments} />
      <FriendsList
        active={active}
        incoming={incoming}
        outgoing={outgoing}
        suggestions={suggestions}
      />
    </div>
  );
}
