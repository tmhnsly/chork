"use client";

import { useState } from "react";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { UserAvatar } from "@/components/ui";
import { CrewActivityFeed } from "./CrewActivityFeed";
import { CrewLeaderboardPanel } from "./CrewLeaderboardPanel";
import { CrewMembersList } from "./CrewMembersList";
import type {
  Crew,
  CrewMember,
  CrewActivityEvent,
  ActiveSetOption,
} from "@/lib/data/crew-queries";
import styles from "./crewDetailView.module.scss";

type Tab = "activity" | "leaderboard" | "members";

interface Props {
  crew: Crew;
  members: CrewMember[];
  myCrews: Crew[];
  liveSets: ActiveSetOption[];
  currentUserId: string;
  defaultSetId: string | null;
  initialFeed: CrewActivityEvent[];
  initialFeedExhausted: boolean;
}

/**
 * Crew detail page — tabs for Activity, Leaderboard, Members.
 *
 * Activity and Leaderboard reuse the existing cross-crew components
 * with a crew-scoped filter (feed) or single-crew mode (leaderboard).
 * Members is a dedicated panel with the invite + leave actions.
 */
export function CrewDetailView({
  crew,
  members,
  myCrews,
  liveSets,
  currentUserId,
  defaultSetId,
  initialFeed,
  initialFeedExhausted,
}: Props) {
  const [tab, setTab] = useState<Tab>("activity");

  // Avatar stack for the detail header — up to 5 avatars.
  const stackPreview = members.slice(0, 5);
  const hiddenCount = Math.max(0, members.length - stackPreview.length);

  return (
    <div className={styles.wrapper}>
      <header className={styles.header}>
        <h1 className={styles.name}>{crew.name}</h1>
        <div className={styles.stack} aria-hidden>
          {stackPreview.map((m, i) => (
            <span
              key={m.user_id}
              className={styles.stackSlot}
              style={{ "--stack-z": stackPreview.length - i } as React.CSSProperties}
            >
              <UserAvatar
                user={{
                  id: m.user_id,
                  username: m.username,
                  name: m.name,
                  avatar_url: m.avatar_url,
                }}
                size={32}
              />
            </span>
          ))}
          {hiddenCount > 0 && (
            <span className={`${styles.stackSlot} ${styles.stackMore}`}>
              +{hiddenCount}
            </span>
          )}
        </div>
      </header>

      <SegmentedControl<Tab>
        options={[
          { value: "activity", label: "Activity" },
          { value: "leaderboard", label: "Leaderboard" },
          { value: "members", label: "Members" },
        ]}
        value={tab}
        onChange={setTab}
        ariaLabel="Crew view"
      />

      {tab === "activity" && (
        <CrewActivityFeed
          hasCrew
          initialEvents={initialFeed}
          initialExhausted={initialFeedExhausted}
          crewId={crew.id}
        />
      )}

      {tab === "leaderboard" && (
        <CrewLeaderboardPanel
          crewId={crew.id}
          liveSets={liveSets}
          initialSetId={defaultSetId}
          currentUserId={currentUserId}
        />
      )}

      {tab === "members" && (
        <CrewMembersList
          crew={crew}
          members={members}
          currentUserId={currentUserId}
          myCrews={myCrews}
        />
      )}
    </div>
  );
}
