import { createServerPBFromCookies } from "@/lib/pocketbase-server";
import { getAuthUser } from "@/lib/pocketbase";
import { getCurrentSet, getRoutesBySet, getLogsBySetForUser } from "@/lib/data/sets";
import { PunchCardClient } from "@/components/PunchCard/PunchCardClient";
import { LandingPage } from "./landing";
import styles from "./page.module.scss";

export default async function Home() {
  const [pb, set] = await Promise.all([
    createServerPBFromCookies(),
    getCurrentSet(),
  ]);
  const user = getAuthUser(pb);

  if (!user) {
    return <LandingPage />;
  }

  if (!set) {
    return (
      <main className={styles.app}>
        <p className={styles.empty}>No active set right now.</p>
      </main>
    );
  }

  const [routes, logs] = await Promise.all([
    getRoutesBySet(set.id),
    getLogsBySetForUser(set.id, user.id),
  ]);

  return (
    <main className={styles.app}>
      <PunchCardClient set={set} routes={routes} initialLogs={logs} />
    </main>
  );
}
