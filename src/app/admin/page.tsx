import Link from "next/link";
import { requireGymAdmin } from "@/lib/auth";
import { getGym } from "@/lib/data/queries";
import { getActiveSetForAdminGym } from "@/lib/data/admin-queries";
import {
  getSetOverview,
  getTopRoutes,
  getActiveClimberCount,
  getEngagementTrend,
  getFlashLeaderboardSet,
  getZoneSendRatio,
  getAllTimeOverview,
  getCommunityGradeDistribution,
  getSetterBreakdown,
} from "@/lib/data/dashboard-queries";
import { AdminDashboardEmpty } from "@/components/admin/AdminDashboardEmpty";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { AdminDashboard } from "@/components/admin/dashboard/AdminDashboard";
import styles from "./admin.module.scss";

export const metadata = {
  title: "Admin - Chork",
};

/**
 * Admin dashboard landing page. Three render branches:
 *
 *   1. Caller isn't an admin of any gym → "start a gym" CTA + link to
 *      /admin/competitions (the organiser role lives here too).
 *   2. Caller admins a gym but there's no active set → empty-state
 *      card guiding them to create the first set.
 *   3. Caller admins a gym with an active set → full dashboard:
 *      overview, engagement, flash leaderboard, top routes,
 *      zone-vs-send ratio, all-time snapshot.
 *
 * All widget data is fetched via Supabase RPCs (migration 018) that
 * aggregate in SQL and guard with is_gym_admin — no client-side loops
 * over raw route_logs.
 */
export default async function AdminHomePage() {
  const auth = await requireGymAdmin();

  if ("error" in auth) {
    return (
      <main className={styles.page}>
        <section className={styles.noGymCard}>
          <h1 className={styles.noGymHeading}>No admin gym yet</h1>
          <p className={styles.noGymBody}>
            You aren&apos;t an admin of any gym right now. Start one to
            manage sets, routes, and climber engagement from here — or
            head to <Link href="/admin/competitions">Competitions</Link>
            {" "}to organise a multi-gym comp.
          </p>
          <Link href="/admin/signup" className={styles.noGymCta}>
            Start a gym
          </Link>
        </section>
      </main>
    );
  }

  const { supabase, gymId, isOwner } = auth;

  const [gym, activeSet] = await Promise.all([
    getGym(supabase, gymId),
    getActiveSetForAdminGym(supabase, gymId),
  ]);

  // No active set yet → direct the admin to create one.
  if (activeSet === null) {
    return (
      <main className={styles.page}>
        <AdminHeader gymName={gym?.name ?? "Your gym"} isOwner={isOwner} />
        <AdminDashboardEmpty />
      </main>
    );
  }

  // Populate every widget in parallel — one parallel fan-out per paint.
  const [
    overview,
    topRoutes,
    engagement,
    activeCount,
    flashes,
    zoneRows,
    allTime,
    gradeDistribution,
    setterRows,
  ] = await Promise.all([
    getSetOverview(supabase, activeSet.id),
    getTopRoutes(supabase, activeSet.id, 15),
    getEngagementTrend(supabase, gymId, 12),
    getActiveClimberCount(supabase, activeSet.id),
    getFlashLeaderboardSet(supabase, activeSet.id, 5),
    getZoneSendRatio(supabase, activeSet.id),
    getAllTimeOverview(supabase, gymId),
    getCommunityGradeDistribution(supabase, activeSet.id),
    getSetterBreakdown(supabase, activeSet.id),
  ]);

  return (
    <main className={styles.page}>
      <AdminHeader gymName={gym?.name ?? "Your gym"} isOwner={isOwner} />
      <AdminDashboard
        activeSet={activeSet}
        overview={overview}
        topRoutes={topRoutes}
        engagement={engagement}
        activeCount={activeCount}
        flashes={flashes}
        zoneRows={zoneRows}
        allTime={allTime}
        gradeDistribution={gradeDistribution}
        setterRows={setterRows}
      />
    </main>
  );
}
