import { Suspense } from "react";
import { createServerSupabase } from "@/lib/supabase/server";
import { getCurrentSet, getRoutesBySet, getLogsBySetForUser } from "@/lib/data/queries";
import { PunchCard } from "@/components/PunchCard/PunchCard";
import { PunchCardSkeleton } from "@/components/PunchCard/PunchCardSkeleton";
import { LandingPage } from "./landing";
import styles from "./page.module.scss";

async function AuthenticatedHome({ userId, gymId }: { userId: string; gymId: string }) {
  const supabase = await createServerSupabase();
  const set = await getCurrentSet(supabase, gymId);

  if (!set) {
    return <p className={styles.empty}>No active set right now.</p>;
  }

  const [routes, logs] = await Promise.all([
    getRoutesBySet(supabase, set.id),
    getLogsBySetForUser(supabase, set.id, userId),
  ]);

  return <PunchCard set={set} routes={routes} initialLogs={logs} />;
}

export default async function Home() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return <LandingPage />;
  }

  // Get the user's profile to find their active gym
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
