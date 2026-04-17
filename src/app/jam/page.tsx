import { redirect } from "next/navigation";
import Link from "next/link";
import { FaPlus, FaUserPlus } from "react-icons/fa6";
import { requireSignedIn } from "@/lib/auth";
import {
  getActiveJamForUser,
  getUserJams,
} from "@/lib/data/jam-queries";
import { PageHeader } from "@/components/motion";
import { Button } from "@/components/ui";
import { ActiveJamBanner } from "@/components/Jam/ActiveJamBanner";
import { JamHistoryList } from "@/components/Jam/JamHistoryList";
import styles from "./jam.module.scss";

export const metadata = {
  title: "Jam - Chork",
};

const RECENT_JAMS_LIMIT = 5;

/**
 * `/jam` landing. Three stacked sections:
 *
 *   1. Active-jam banner (conditional) — reconnection surface for a
 *      user who closed the app mid-jam.
 *   2. Start / Join primary CTAs.
 *   3. Recent jams — a compact history list.
 *
 * All reads happen server-side through the jam RPCs; the client gets
 * a fully-rendered page on first byte.
 */
export default async function JamPage() {
  const auth = await requireSignedIn();
  if ("error" in auth) redirect("/login");
  const { supabase, userId } = auth;

  // Fetch in parallel. Active jam is a single indexed lookup; history
  // list is the top N summaries (default 5 for the strip).
  const [activeJam, recentJams] = await Promise.all([
    getActiveJamForUser(supabase),
    getUserJams(supabase, userId, { limit: RECENT_JAMS_LIMIT }),
  ]);

  return (
    <main className={styles.page}>
      <PageHeader
        title="Jam"
        subtitle="Ad-hoc comps with friends — anywhere, any wall."
      />

      {activeJam && <ActiveJamBanner jam={activeJam} />}

      <section className={styles.actionsCard} aria-label="Start or join a jam">
        <div className={styles.actionHeader}>
          <h2 className={styles.actionHeading}>Run it with the crew.</h2>
          <p className={styles.actionLede}>
            A jam is a quick comp you can start anywhere. Add routes as
            you go, log your own attempts, climb the live leaderboard.
          </p>
        </div>
        <div className={styles.actionButtons}>
          <Link href="/jam/new" className={styles.actionLink}>
            <Button fullWidth>
              <FaPlus aria-hidden /> Start a jam
            </Button>
          </Link>
          <Link href="/jam/join" className={styles.actionLink}>
            <Button variant="secondary" fullWidth>
              <FaUserPlus aria-hidden /> Join a jam
            </Button>
          </Link>
        </div>
      </section>

      <section
        className={styles.historySection}
        aria-labelledby="recent-jams-heading"
      >
        <div className={styles.historyHeader}>
          <h2 id="recent-jams-heading" className={styles.historyHeading}>
            Recent jams
          </h2>
          {recentJams.length > 0 && (
            <Link href="/profile" className={styles.historyLink}>
              See all
            </Link>
          )}
        </div>
        {recentJams.length === 0 ? (
          <div className={styles.emptyState}>
            <p className={styles.emptyTitle}>No jams yet</p>
            <p className={styles.emptyLede}>
              Start one with your mates or join by code.
            </p>
            <Link href="/jam/new" className={styles.actionLink}>
              <Button>
                <FaPlus aria-hidden /> Start the first one
              </Button>
            </Link>
          </div>
        ) : (
          <JamHistoryList jams={recentJams} />
        )}
      </section>
    </main>
  );
}
