import { redirect } from "next/navigation";
import { requireSignedIn } from "@/lib/auth";
import { PageHeader, Reveal } from "@/components/motion";
import { NextGameCard } from "./NextGameCard";
import { LiveGame } from "./LiveGame";
import { RecentGames, RecentGamesSkeleton } from "./RecentGames";
import styles from "./match.module.scss";

export const metadata = {
  title: "Games",
};

/**
 * `/match` landing: a shell that renders instantly — the title and
 * the Start / Join card need no data — with the two data sections
 * streaming in behind their own boundaries:
 *
 *   1. The live-game banner, which exists or doesn't. No route
 *      skeleton could reserve it, so there is no route skeleton: the
 *      banner reveals and the card beneath tweens down.
 *   2. Leagues and recent games, revealed over their own skeleton.
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
      <div data-vt="next-game">
        <NextGameCard />
      </div>
      <Reveal fallback={<RecentGamesSkeleton />}>
        <RecentGames />
      </Reveal>
    </main>
  );
}
