import { Suspense } from "react";
import { createServerPBFromCookies } from "@/lib/pocketbase-server";
import { getAuthUser } from "@/lib/pocketbase-shared";
import { getCurrentSet, getRoutesBySet, getLogsBySetForUser } from "@/lib/data/queries";
import { PunchCard } from "@/components/PunchCard/PunchCard";
import { PunchCardSkeleton } from "@/components/PunchCard/PunchCardSkeleton";
import { LandingPage } from "./landing";
import styles from "./page.module.scss";

async function AuthenticatedHome({ userId }: { userId: string }) {
  const pb = await createServerPBFromCookies();
  const set = await getCurrentSet(pb);

  if (!set) {
    return <p className={styles.empty}>No active set right now.</p>;
  }

  const [routes, logs] = await Promise.all([
    getRoutesBySet(pb, set.id),
    getLogsBySetForUser(pb, set.id, userId),
  ]);

  return <PunchCard set={set} routes={routes} initialLogs={logs} />;
}

export default async function Home() {
  const pb = await createServerPBFromCookies();
  const user = getAuthUser(pb);

  if (!user) {
    return <LandingPage />;
  }

  return (
    <main className={styles.app}>
      <Suspense fallback={<PunchCardSkeleton />}>
        <AuthenticatedHome userId={user.id} />
      </Suspense>
    </main>
  );
}
