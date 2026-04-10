import { Suspense } from "react";
import { createServerSupabase } from "@/lib/supabase/server";
import { getCurrentSet, getRoutesBySet, getLogsBySetForUser, getUserGymRole, isGymAdmin } from "@/lib/data/queries";
import { PunchCard } from "@/components/PunchCard/PunchCard";
import { PunchCardSkeleton } from "@/components/PunchCard/PunchCardSkeleton";
import { CreateSetForm } from "@/components/AdminControls/CreateSetForm";
import { ManageSetBar } from "@/components/AdminControls/ManageSetBar";
import { LandingPage } from "./landing";
import styles from "./page.module.scss";

async function AuthenticatedHome({ userId, gymId }: { userId: string; gymId: string }) {
  const supabase = await createServerSupabase();

  const [set, role] = await Promise.all([
    getCurrentSet(supabase, gymId),
    getUserGymRole(supabase, userId, gymId),
  ]);

  const admin = isGymAdmin(role);

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
      <PunchCard set={set} routes={routes} initialLogs={logs} />
    </>
  );
}

export default async function Home() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return <LandingPage />;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("active_gym_id, onboarded")
    .eq("id", user.id)
    .single();

  if (!profile?.onboarded || !profile.active_gym_id) {
    return <LandingPage />;
  }

  return (
    <main className={styles.app}>
      <Suspense fallback={<PunchCardSkeleton />}>
        <AuthenticatedHome userId={user.id} gymId={profile.active_gym_id} />
      </Suspense>
    </main>
  );
}
