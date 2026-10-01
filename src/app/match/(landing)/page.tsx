import { redirect } from "next/navigation";
import { requireSignedIn } from "@/lib/auth";
import { PageHeader, Reveal, Named } from "@/components/motion";
import { NextGameCard } from "./NextGameCard";
import { LiveGame } from "./LiveGame";
import { RecentGames, RecentGamesSkeleton } from "./RecentGames";
import { SectionNotifications } from "@/components/Notifications/SectionNotifications";
import styles from "./match.module.scss";

export const metadata = {
  title: "Games",
};

/**
 * `/match` landing: a shell that renders instantly — the title and
 * the Start / Join card need no data — with the two data sections
 * streaming in behind their own boundaries:
 *
 *   1. The live-game banner and any game invites, which exist or
 *      don't. No route skeleton could reserve them, so there is no
 *      route skeleton: they reveal and the card beneath tweens down.
 *   2. Recent games, revealed over their own skeleton.
 *
 * Auth is the one thing the shell waits for, and it is a cookie read.
 */
export default async function MatchPage() {
  const auth = await requireSignedIn();
  if ("error" in auth) redirect("/login");

  return (
    <main className={styles.page}>
      <PageHeader title="Games" />
      <Reveal fallback={null}>
        <LiveGame />
      </Reveal>
      {/* This section's slice of the Notification log: a game invite
          lands where joining happens, and only game kinds get
          read-flagged by the visit. Like the banner it exists or it
          doesn't, so it reveals and the card beneath tweens down. A
          push that was missed, or switched off, used to leave an
          invite with nowhere to be seen. */}
      <Reveal fallback={null}>
        <SectionNotifications section="match" />
      </Reveal>
      <Named name="next-game" update="tween">
        <NextGameCard />
      </Named>
      <Reveal fallback={<RecentGamesSkeleton />}>
        <RecentGames />
      </Reveal>
    </main>
  );
}
