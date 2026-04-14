"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { FaPlus, FaUsers } from "react-icons/fa6";
import { Button } from "@/components/ui";
import { PendingInvitesCard } from "./PendingInvitesCard";
import { CrewCard } from "./CrewCard";
import type {
  Crew,
  CrewMember,
  PendingInvite,
} from "@/lib/data/crew-queries";
import styles from "./crewPicker.module.scss";

// Lazy-load the create sheet — only mounts once the user taps the
// primary CTA or the empty-state button. Shrinks initial bundle.
const CreateCrewSheet = dynamic(
  () => import("./CreateCrewSheet").then((m) => m.CreateCrewSheet),
  { ssr: false },
);

interface Props {
  myCrews: Crew[];
  invites: PendingInvite[];
  /** Member previews keyed by crew id — up to N per crew, used for
   *  the stacked avatars on each card. */
  previews: Record<string, Pick<CrewMember, "user_id" | "username" | "name" | "avatar_url">[]>;
}

/**
 * Crew picker — the /crew landing page. Lists the caller's crews as
 * tappable cards that navigate to `/crew/[id]` for the detail view,
 * pins pending invites to the top, and hero-sells the feature when
 * the user isn't in any crews yet.
 *
 * Replaces the old catch-all CrewHome which tried to cram search,
 * activity, and leaderboard onto one surface — each now lives on
 * the crew's own route.
 */
export function CrewPicker({ myCrews, invites, previews }: Props) {
  const [createOpen, setCreateOpen] = useState(false);

  const hasCrews = myCrews.length > 0;

  return (
    <div className={styles.wrapper}>
      {invites.length > 0 && <PendingInvitesCard invites={invites} />}

      {hasCrews ? (
        <>
          <div className={styles.listHead}>
            <h2 className={styles.listHeading}>Your crews</h2>
            <Button
              variant="secondary"
              onClick={() => setCreateOpen(true)}
            >
              <FaPlus aria-hidden /> New crew
            </Button>
          </div>

          <ul className={styles.list} aria-label="Your crews">
            {myCrews.map((crew) => (
              <li key={crew.id}>
                <CrewCard
                  crew={crew}
                  memberPreview={previews[crew.id] ?? []}
                />
              </li>
            ))}
          </ul>
        </>
      ) : (
        <section className={styles.hero}>
          <span className={styles.heroIcon} aria-hidden>
            <FaUsers />
          </span>
          <h2 className={styles.heroTitle}>Start a crew</h2>
          <p className={styles.heroBody}>
            A crew is a private group with its own leaderboard — invite
            your mates to see who&apos;s climbing what this week.
          </p>
          <Button onClick={() => setCreateOpen(true)} fullWidth>
            <FaPlus aria-hidden /> Create a crew
          </Button>
        </section>
      )}

      <CreateCrewSheet
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          // Server page revalidates on crew create, so the new crew
          // will render on the next paint.
        }}
      />
    </div>
  );
}
