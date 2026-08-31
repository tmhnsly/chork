import { redirect } from "next/navigation";
import Link from "next/link";
import { FaPlus, FaUserPlus } from "react-icons/fa6";
import { requireSignedIn } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import {
  getActiveMatchForUserById,
  getUserMatches,
} from "@/lib/data/match-queries";
import { getMyLeagues } from "@/lib/data/league-queries";
import { PageHeader } from "@/components/motion";
import { ChorkMark, LinkButton } from "@/components/ui";
import { ActiveMatchBanner } from "@/components/Match/ActiveMatchBanner";
import { MatchHistoryList } from "@/components/Match/MatchHistoryList";
import { LeagueList } from "@/components/League/LeagueList";
import styles from "./match.module.scss";

export const metadata = {
  title: "Match",
};

const RECENT_MATCHES_LIMIT = 5;

/**
 * `/match` landing. Three stacked sections:
 *
 *   1. Active-match banner (conditional) — reconnection surface for a
 *      user who closed the app mid-match.
 *   2. Start / Join primary CTAs.
 *   3. Recent matches — a compact history list.
 *
 * All reads happen server-side through the Match RPCs; the client gets
 * a fully-rendered page on first byte.
 */
export default async function MatchPage() {
  const auth = await requireSignedIn();
  if ("error" in auth) redirect("/login");
  const { userId } = auth;

  // Both go through service-role RPCs that take the user id
  // explicitly, so the banner can't point at a Match the page can't
  // actually load — both paths resolve membership the same way.
  // `requireSignedIn` above is what authorises the user id we pass.
  const service = createServiceClient();
  const [activeMatch, recentMatches, leagues] = await Promise.all([
    getActiveMatchForUserById(service, userId),
    getUserMatches(service, userId, { limit: RECENT_MATCHES_LIMIT }),
    getMyLeagues(auth.supabase),
  ]);

  return (
    <main className={styles.page}>
      <PageHeader
        title="Match"
        subtitle="Ad-hoc comps with friends — anywhere, any wall."
      />

      {activeMatch && <ActiveMatchBanner match={activeMatch} />}

      <section className={styles.actionsCard} aria-label="Start or join a match">
        <div className={styles.actionHeader}>
          <h2 className={styles.actionHeading}>Run it with your friends.</h2>
          <p className={styles.actionLede}>
            A match is a quick comp you can start anywhere. Add routes as
            you go, log your own attempts, climb the live leaderboard.
          </p>
        </div>
        <div className={styles.actionButtons}>
          <LinkButton href="/match/new" fullWidth>
            <FaPlus aria-hidden /> Start a match
          </LinkButton>
          <LinkButton href="/match/join" variant="secondary" fullWidth>
            <FaUserPlus aria-hidden /> Join a match
          </LinkButton>
        </div>
      </section>

      {leagues.length > 0 && (
        <section className={styles.historySection} aria-labelledby="leagues-heading">
          <div className={styles.historyHeader}>
            <h2 id="leagues-heading" className={styles.historyHeading}>Your leagues</h2>
          </div>
          <LeagueList leagues={leagues} />
        </section>
      )}

      <section
        className={styles.historySection}
        aria-labelledby="recent-matches-heading"
      >
        <div className={styles.historyHeader}>
          <h2 id="recent-matches-heading" className={styles.historyHeading}>
            Recent matches
          </h2>
          {recentMatches.length > 0 && (
            <Link href="/profile" className={styles.historyLink}>
              See all
            </Link>
          )}
        </div>
        {recentMatches.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyMark} aria-hidden>
              <ChorkMark size={56} mode="accent" />
            </div>
            <p className={styles.emptyTitle}>No matches yet</p>
            <p className={styles.emptyLede}>
              Start one with your mates or join by code.
            </p>
            <LinkButton href="/match/new">
              <FaPlus aria-hidden /> Start the first one
            </LinkButton>
          </div>
        ) : (
          <MatchHistoryList matches={recentMatches} />
        )}
      </section>
    </main>
  );
}
