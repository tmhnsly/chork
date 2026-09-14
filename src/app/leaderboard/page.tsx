import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { isNoGymError } from "@/lib/auth-errors";
import { PageHeader, Reveal } from "@/components/motion";
import { LeaderboardSkeleton } from "@/components/Leaderboard/LeaderboardSkeleton";
import { LeaderboardContent } from "./LeaderboardContent";
import styles from "./leaderboard.module.scss";

export const metadata = {
  title: "Chorkboard",
};

/**
 * The Chorkboard: the title renders instantly, the board streams in
 * behind its own boundary over a skeleton built from the board's own
 * components. Gymless users land on /match rather than /login — the
 * gym-scoped board has no meaning without a gym.
 */
export default async function LeaderboardPage() {
  const auth = await requireAuth();
  if ("error" in auth) {
    redirect(isNoGymError(auth.error) ? "/match" : "/login");
  }

  return (
    <main className={styles.page}>
      <PageHeader title="Chorkboard" />
      <Reveal fallback={<LeaderboardSkeleton />}>
        <LeaderboardContent />
      </Reveal>
    </main>
  );
}
