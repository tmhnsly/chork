import { redirect } from "next/navigation";
import { requireSignedIn } from "@/lib/auth";
import {
  getMyCrews,
  getPendingCrewInvites,
  getAllLiveSets,
} from "@/lib/data/crew-queries";
import { getServerProfile } from "@/lib/supabase/server";
import { CrewHome } from "@/components/Crew/CrewHome";
import { RevealText } from "@/components/motion";
import styles from "./crew.module.scss";

export const metadata = {
  title: "Crew - Chork",
};

export default async function CrewPage() {
  const auth = await requireSignedIn();
  if ("error" in auth) redirect("/login");
  const { supabase, userId } = auth;

  // Fetch everything the Crew tab needs in parallel — the pickers, the
  // inbox, and the global set list. Activity feed + leaderboard rows
  // are fetched lazily on the client once a crew is selected, since
  // both are cursor-paginated.
  const [myCrews, invites, liveSets, profile] = await Promise.all([
    getMyCrews(supabase, userId),
    getPendingCrewInvites(supabase, userId),
    getAllLiveSets(supabase),
    getServerProfile(),
  ]);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <RevealText text="Crew" as="h1" className={styles.title} />
        <p className={styles.sub}>Your climbing group, your private leaderboard.</p>
      </header>

      <CrewHome
        myCrews={myCrews}
        invites={invites}
        liveSets={liveSets}
        currentUserId={userId}
        activeGymId={profile?.active_gym_id ?? null}
      />
    </main>
  );
}
