import { Suspense } from "react";
import { createServerSupabase, getServerProfile } from "@/lib/supabase/server";
import {
  getCurrentSet,
  getRoutesBySet,
  getLogsBySetForUser,
  getGym,
} from "@/lib/data/queries";
import { isGymAdminOf } from "@/lib/data/admin-queries";
import { SendsGrid } from "@/components/SendsGrid/SendsGrid";
import { SendsGridSkeleton } from "@/components/SendsGrid/SendsGridSkeleton";
import { PageHeader } from "@/components/motion";
import { CreateSetForm } from "@/components/AdminControls/CreateSetForm";
import { LandingPage } from "./landing";
import styles from "./page.module.scss";

/**
 * Home blocks just long enough to resolve the profile (so we know
 * whether to show the landing page vs the authenticated wall), then
 * renders the page header synchronously and streams the heavy data
 * (current set + routes + logs) through a Suspense boundary. The
 * header is *outside* the Suspense so its reveal animation plays
 * once — without this, the skeleton paints a static title, the data
 * resolves, the client component mounts, and RevealText fires again,
 * producing a title → flash → re-animate flicker.
 */
export default async function Home() {
  const profile = await getServerProfile();

  if (!profile || !profile.onboarded || !profile.active_gym_id) {
    return <LandingPage />;
  }

  const userId = profile.id;
  const gymId = profile.active_gym_id;

  return (
    <main className={styles.app}>
      <PageHeader title="The Wall" as="h2" />
      <Suspense fallback={<SendsGridSkeleton />}>
        <AuthenticatedHome userId={userId} gymId={gymId} />
      </Suspense>
    </main>
  );
}

async function AuthenticatedHome({ userId, gymId }: { userId: string; gymId: string }) {
  const supabase = await createServerSupabase();

  const [set, admin, gym] = await Promise.all([
    getCurrentSet(gymId),
    // gym_admins is the authoritative source — gym_memberships.role
    // is cosmetic per CLAUDE.md and doesn't gate any RLS check.
    isGymAdminOf(supabase, userId, gymId),
    getGym(gymId),
  ]);

  const gymName = gym?.name ?? null;

  if (!set) {
    if (admin) return <CreateSetForm gymId={gymId} />;
    return <p className={styles.empty}>No active set right now.</p>;
  }

  const [routes, logs] = await Promise.all([
    getRoutesBySet(set.id),
    getLogsBySetForUser(supabase, set.id, userId),
  ]);

  // Admin set-management actions (end set, edit, etc.) live on
  // /admin — climbers + admins both see the same Wall here. The Admin
  // tab in NavBar is the entry point for the admin dashboard.
  return (
    <SendsGrid set={set} routes={routes} initialLogs={logs} gymName={gymName} />
  );
}
