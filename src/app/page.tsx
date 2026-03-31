import { Suspense } from "react";
import { createServerPBFromCookies } from "@/lib/pocketbase-server";
import { getAuthUser } from "@/lib/pocketbase";
import { getCurrentSet, getRoutesBySet, getLogsBySetForUser } from "@/lib/data/sets";
import { PunchCardClient } from "@/components/PunchCard/PunchCardClient";
import { PunchCardSkeleton } from "@/components/PunchCard/PunchCardSkeleton";
import { LandingPage } from "./landing";
import styles from "./page.module.scss";

async function AuthenticatedHome({ userId }: { userId: string }) {
  const set = await getCurrentSet();

  if (!set) {
    return <p className={styles.empty}>No active set right now.</p>;
  }

  const [routes, logs] = await Promise.all([
    getRoutesBySet(set.id),
    getLogsBySetForUser(set.id, userId),
  ]);

  return <PunchCardClient set={set} routes={routes} initialLogs={logs} />;
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
