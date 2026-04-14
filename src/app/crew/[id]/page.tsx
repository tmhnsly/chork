import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { FaChevronLeft } from "react-icons/fa6";
import { requireSignedIn } from "@/lib/auth";
import {
  getMyCrews,
  getCrewMembers,
  getAllLiveSets,
  getCrewActivityFeed,
} from "@/lib/data/crew-queries";
import { getServerProfile } from "@/lib/supabase/server";
import { CrewDetailView } from "@/components/Crew/CrewDetailView";
import styles from "./crewDetail.module.scss";

export const metadata = {
  title: "Crew - Chork",
};

// Keep in sync with PAGE_SIZE inside CrewActivityFeed.
const INITIAL_FEED_PAGE = 30;

interface Props {
  params: Promise<{ id: string }>;
}

export default async function CrewDetailPage({ params }: Props) {
  const { id } = await params;

  const auth = await requireSignedIn();
  if ("error" in auth) redirect("/login");
  const { supabase, userId } = auth;

  // Parallel fan-out — detail page needs the target crew (from the
  // caller's membership list), its roster, live sets for the
  // leaderboard tab, profile for default gym, and the first page of
  // the shared activity feed (filtered client-side to this crew).
  const [myCrews, members, liveSets, profile, initialFeed] = await Promise.all([
    getMyCrews(supabase, userId),
    getCrewMembers(supabase, id),
    getAllLiveSets(supabase),
    getServerProfile(),
    // Server-scoped to this crew via migration 029's p_crew_id
    // param. The RPC gates access on active membership so callers
    // who hit a URL they aren't in get an empty feed, not a leak.
    getCrewActivityFeed(supabase, INITIAL_FEED_PAGE, null, id),
  ]);

  const crew = myCrews.find((c) => c.id === id);
  if (!crew) notFound();

  // Default to the live set at the viewer's own gym when possible.
  const defaultSetId =
    liveSets.find((s) => s.gym_id === profile?.active_gym_id)?.set_id ??
    liveSets[0]?.set_id ??
    null;

  return (
    <main className={styles.page}>
      <Link href="/crew" className={styles.back} aria-label="Back to crews">
        <FaChevronLeft aria-hidden /> All crews
      </Link>

      <CrewDetailView
        crew={crew}
        members={members}
        myCrews={myCrews}
        liveSets={liveSets}
        currentUserId={userId}
        defaultSetId={defaultSetId}
        initialFeed={initialFeed}
        initialFeedExhausted={initialFeed.length < INITIAL_FEED_PAGE}
      />
    </main>
  );
}
