import { Suspense } from "react";
import { createServerSupabase, getServerProfile } from "@/lib/supabase/server";
import {
  getCurrentSet,
  getRoutesBySet,
  getLogsBySetForUser,
  getUserGymRole,
  isGymAdmin,
  getGym,
} from "@/lib/data/queries";
import { SendsGrid } from "@/components/SendsGrid/SendsGrid";
import { SendsGridSkeleton } from "@/components/SendsGrid/SendsGridSkeleton";
import { CreateSetForm } from "@/components/AdminControls/CreateSetForm";
import { ManageSetBar } from "@/components/AdminControls/ManageSetBar";
import { LandingPage } from "./landing";
import styles from "./page.module.scss";

/**
 * Home is a thin synchronous shell — the expensive profile fetch
 * and all downstream data happens inside a Suspense boundary so the
 * page streams. The browser gets first HTML bytes immediately, sees
 * the skeleton while the server resolves the profile + sets + routes,
 * then swaps in the real content.
 *
 * Previously `Home` was async and blocked on getServerProfile before
 * returning any markup — that meant the entire app was white-screened
 * for the duration of the profile select on every cold navigation.
 */
export default function Home() {
  return (
    <main className={styles.app}>
      <Suspense fallback={<SendsGridSkeleton />}>
        <HomeResolver />
      </Suspense>
    </main>
  );
}

async function HomeResolver() {
  const profile = await getServerProfile();

  // Unauthed or partially-onboarded users see the marketing page.
  // Middleware redirects signed-out users to /login before this point
  // for protected routes, but `/` is explicitly public so the landing
  // fallback is still reachable.
  if (!profile || !profile.onboarded || !profile.active_gym_id) {
    return <LandingPage />;
  }

  return <AuthenticatedHome userId={profile.id} gymId={profile.active_gym_id} />;
}

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
    if (admin) return <CreateSetForm gymId={gymId} />;
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
