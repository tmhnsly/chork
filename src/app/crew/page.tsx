import { redirect } from "next/navigation";
import { requireSignedIn } from "@/lib/auth";
import {
  getMyCrews,
  getPendingCrewInvites,
  getAllLiveSets,
  getCrewActivityFeed,
} from "@/lib/data/crew-queries";
import { getServerProfile } from "@/lib/supabase/server";
import { CrewHome } from "@/components/Crew/CrewHome";
import { PageHeader } from "@/components/motion";
// RevealText no longer needed directly — PageHeader wraps it and
// applies the canonical page-title typography.
import styles from "./crew.module.scss";

export const metadata = {
  title: "Crew - Chork",
};

// Matches the PAGE_SIZE constant in CrewActivityFeed — must stay in
// sync so the "show more" cursor lands on the exact right boundary.
const INITIAL_FEED_PAGE = 30;

export default async function CrewPage() {
  const auth = await requireSignedIn();
  if ("error" in auth) redirect("/login");
  const { supabase, userId } = auth;

  // Single parallel fan-out. The activity feed's first page is
  // included so /crew paints fully populated — no client-side spinner
  // on the primary section when you open the tab. Subsequent feed
  // pages are lazy-loaded from the cursor passed to CrewHome.
  const [myCrews, invites, liveSets, profile, initialFeed] = await Promise.all([
    getMyCrews(supabase, userId),
    getPendingCrewInvites(supabase, userId),
    getAllLiveSets(supabase),
    getServerProfile(),
    getCrewActivityFeed(supabase, INITIAL_FEED_PAGE),
  ]);

  return (
    <main className={styles.page}>
      <PageHeader title="Crew" subtitle="Your climbing group, your private leaderboard." />

      <CrewHome
        myCrews={myCrews}
        invites={invites}
        liveSets={liveSets}
        currentUserId={userId}
        activeGymId={profile?.active_gym_id ?? null}
        initialFeed={initialFeed}
        initialFeedExhausted={initialFeed.length < INITIAL_FEED_PAGE}
      />
    </main>
  );
}
