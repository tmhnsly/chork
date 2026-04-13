"use client";

import { useMemo, useState } from "react";
import { FaMagnifyingGlass } from "react-icons/fa6";
import type {
  Crew,
  PendingInvite,
  ActiveSetOption,
  CrewActivityEvent,
} from "@/lib/data/crew-queries";
import { PendingInvitesCard } from "./PendingInvitesCard";
import { CrewActivityFeed } from "./CrewActivityFeed";
import { CrewLeaderboardSection } from "./CrewLeaderboardSection";
import { CrewSearchSheet } from "./CrewSearchSheet";
import { CreateCrewSheet } from "./CreateCrewSheet";
import styles from "./crewHome.module.scss";

interface Props {
  myCrews: Crew[];
  invites: PendingInvite[];
  liveSets: ActiveSetOption[];
  currentUserId: string;
  activeGymId: string | null;
  initialFeed: CrewActivityEvent[];
  initialFeedExhausted: boolean;
}

/**
 * Client-side shell for the Crew tab. Owns local UI state — which
 * crew is selected, which set is picked for the leaderboard, and
 * whether the search/create sheets are open. Server passes all the
 * static data through props in one round-trip.
 */
export function CrewHome({
  myCrews,
  invites,
  liveSets,
  currentUserId,
  activeGymId,
  initialFeed,
  initialFeedExhausted,
}: Props) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  // First crew is selected by default. If the user hasn't joined any
  // crews yet `selectedCrewId` stays null and the leaderboard section
  // shows its empty state.
  const [selectedCrewId, setSelectedCrewId] = useState<string | null>(
    myCrews[0]?.id ?? null
  );

  // Default set — prefer the active gym's live set, fall back to the
  // first listed live set, fall back to null (handled in leaderboard).
  const defaultSetId = useMemo(() => {
    const atMyGym = liveSets.find((s) => s.gym_id === activeGymId);
    if (atMyGym) return atMyGym.set_id;
    return liveSets[0]?.set_id ?? null;
  }, [liveSets, activeGymId]);
  const [selectedSetId, setSelectedSetId] = useState<string | null>(defaultSetId);

  return (
    <div className={styles.wrapper}>
      {/* Full-width search entry-point. Visually an input, functionally
          a button — it opens the CrewSearchSheet where the real query
          field lives (handles debounced async results, etc.). */}
      <button
        type="button"
        className={styles.searchField}
        onClick={() => setSearchOpen(true)}
        aria-label="Search climbers"
      >
        <span className={styles.searchPlaceholder}>Search climbers…</span>
        <span className={styles.searchIcon} aria-hidden>
          <FaMagnifyingGlass />
        </span>
      </button>

      {invites.length > 0 && <PendingInvitesCard invites={invites} />}

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Activity</h2>
        <CrewActivityFeed
          hasCrew={myCrews.length > 0}
          initialEvents={initialFeed}
          initialExhausted={initialFeedExhausted}
        />
      </section>

      <CrewLeaderboardSection
        myCrews={myCrews}
        liveSets={liveSets}
        selectedCrewId={selectedCrewId}
        onSelectCrew={setSelectedCrewId}
        selectedSetId={selectedSetId}
        onSelectSet={setSelectedSetId}
        currentUserId={currentUserId}
        onCreateCrew={() => setCreateOpen(true)}
      />

      <CrewSearchSheet
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        myCrews={myCrews}
        onCreateCrew={() => {
          setSearchOpen(false);
          setCreateOpen(true);
        }}
      />

      <CreateCrewSheet
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(crewId) => {
          // Switch focus to the new crew so the leaderboard updates.
          setSelectedCrewId(crewId);
        }}
      />
    </div>
  );
}
