import { Suspense } from "react";
import { createServerSupabase, getServerProfile } from "@/lib/supabase/server";
import { getCurrentSet, getRoutesBySet, getLogsBySetForUser, getUserGymRole, isGymAdmin, getGym } from "@/lib/data/queries";
import { SendsGrid } from "@/components/SendsGrid/SendsGrid";
import { SendsGridSkeleton } from "@/components/SendsGrid/SendsGridSkeleton";
import { CreateSetForm } from "@/components/AdminControls/CreateSetForm";
import { ManageSetBar } from "@/components/AdminControls/ManageSetBar";
import { LandingPage } from "./landing";
import styles from "./page.module.scss";

async function AuthenticatedHome({ userId, gymId }: { userId: string; gymId: string }) {
  const supabase = await createServerSupabase();

  const [set, role, gym] = await Promise.all([
    getCurrentSet(supabase, gymId),
    getUserGymRole(supabase, userId, gymId),
    getGym(supabase, gymId),
  ]);

  const admin = isGymAdmin(role);
  const gymName = gym?.name ?? null;

  if (!set) {
    if (admin) {
      return <CreateSetForm gymId={gymId} />;
    }
    return <p className={styles.empty}>No active set right now.</p>;
  }

  const [routes, logs] = await Promise.all([
    getRoutesBySet(supabase, set.id),
    getLogsBySetForUser(supabase, set.id, userId),
  ]);

  return (
    <>
      {admin && <ManageSetBar set={set} gymId={gymId} routeCount={routes.length} />}
      <SendsGrid set={set} routes={routes} initialLogs={logs} gymName={gymName} />
    </>
  );
}

export default async function Home() {
  // `getServerProfile` is deduped (React cache) against the root
  // layout — this page doesn't add a second auth round-trip.
  const profile = await getServerProfile();

  if (!profile) {
    return <LandingPage />;
  }

  if (!profile.onboarded || !profile.active_gym_id) {
    return <LandingPage />;
  }

  return (
    <main className={styles.app}>
      <Suspense fallback={<SendsGridSkeleton />}>
        <AuthenticatedHome userId={profile.id} gymId={profile.active_gym_id} />
      </Suspense>
    </main>
  );
}
