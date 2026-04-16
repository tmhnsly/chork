import { Suspense } from "react";
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
  getSetterBreakdown,
} from "@/lib/data/dashboard-queries";
import { AdminDashboardEmpty } from "@/components/admin/AdminDashboardEmpty";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { AdminDashboard } from "@/components/admin/dashboard/AdminDashboard";
import { AdminDashboardSkeleton } from "@/components/admin/dashboard/AdminDashboardSkeleton";
import { createServerSupabase } from "@/lib/supabase/server";
import type { AdminSetSummary } from "@/lib/data/admin-queries";
import styles from "./admin.module.scss";

export const metadata = {
  title: "Admin - Chork",
};

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

  // Light-weight header data — blocks the shell, but fast.
  const [gym, activeSet] = await Promise.all([
    getGym(gymId),
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

  // Stream the dashboard — each widget RPC adds latency; streaming
  // lets the header + nav paint immediately and the widgets arrive
  // when ready. Shows a skeleton in the meantime so the page has
  // shape rather than a blank.
  return (
    <main className={styles.page}>
      <AdminHeader gymName={gym?.name ?? "Your gym"} isOwner={isOwner} />
      <Suspense fallback={<AdminDashboardSkeleton />}>
        <DashboardBody gymId={gymId} activeSetId={activeSet.id} activeSet={activeSet} />
      </Suspense>
    </main>
  );
}

async function DashboardBody({
  gymId,
  activeSetId,
  activeSet,
}: {
  gymId: string;
  activeSetId: string;
  activeSet: AdminSetSummary;
}) {
  const supabase = await createServerSupabase();
  const [
    overview,
    topRoutes,
    engagement,
    activeCount,
    flashes,
    zoneRows,
    allTime,
    setterRows,
  ] = await Promise.all([
    getSetOverview(supabase, activeSetId),
    getTopRoutes(supabase, activeSetId, 15),
    getEngagementTrend(supabase, gymId, 12),
    getActiveClimberCount(supabase, activeSetId),
    getFlashLeaderboardSet(supabase, activeSetId, 5),
    getZoneSendRatio(supabase, activeSetId),
    getAllTimeOverview(supabase, gymId),
    getSetterBreakdown(supabase, activeSetId),
  ]);

  return (
    <AdminDashboard
      activeSet={activeSet}
      overview={overview}
      topRoutes={topRoutes}
      engagement={engagement}
      activeCount={activeCount}
      flashes={flashes}
      zoneRows={zoneRows}
      allTime={allTime}
      setterRows={setterRows}
    />
  );
}
