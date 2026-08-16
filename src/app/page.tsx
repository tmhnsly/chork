import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createServerSupabase, getServerProfile } from "@/lib/supabase/server";
import { getCurrentSet } from "@/lib/data/set-queries";
import { getRoutesBySet } from "@/lib/data/route-queries";
import { getLogsBySetForUser } from "@/lib/data/route-log-queries";
import { getGym } from "@/lib/data/gym-queries";
import { isGymAdminOf } from "@/lib/data/admin-queries";
import { fetchMyRank } from "./(app)/rank-actions";
import { GymScreen } from "@/components/SendsGrid/GymScreen";
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

  // Unauthed or mid-onboarding → landing marketing page.
  if (!profile || !profile.onboarded) {
    return <LandingPage />;
  }

  // Authed but gymless (onboarded without a gym, or added the app
  // before claiming a gym) → /match is the most useful destination.
  // The Wall has no meaning without an active set, and /match lets
  // them start running matches with friends immediately.
  if (!profile.active_gym_id) {
    redirect("/match");
  }

  const userId = profile.id;
  const gymId = profile.active_gym_id;

  return (
    <main className={styles.app}>
      {/* h1: this is the app's primary authed route and its heading.
          It was the only `as="h2"` of 16 PageHeader call sites, which
          left `/` with no h1 at all. */}
      <PageHeader title="Card" />
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

  const [routes, logs, rank] = await Promise.all([
    getRoutesBySet(set.id),
    getLogsBySetForUser(supabase, set.id, userId),
    // Where they stand, for the strip above the card. One indexed
    // lookup plus the cached gym-stats RPC — no board is fetched.
    fetchMyRank(),
  ]);

  // Admin set-management actions (end set, edit, etc.) live on
  // /admin — climbers + admins both see the same Wall here. The Admin
  // tab in NavBar is the entry point for the admin dashboard.
  return (
    <GymScreen
      set={set}
      routes={routes}
      initialLogs={logs}
      gymName={gymName}
      initialRank={rank ?? { rank: null, points: 0, climberCount: 0 }}
    />
  );
}
