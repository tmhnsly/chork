import type { Route, RouteLog } from "@/lib/data";
import { deriveTileState } from "@/lib/data";
import { PunchTile } from "@/components/PunchTile/PunchTile";
import { RouteChart } from "@/components/RouteChart/RouteChart";
import { Legend } from "@/components/ui";
import styles from "./currentSetSection.module.scss";

interface Props {
  routes: Route[];
  logs: RouteLog[];
}

/** Current set grid with legend and route chart - used on the profile page. */
export function CurrentSetSection({ routes, logs }: Props) {
  const logByRoute = new Map(logs.map((l) => [l.route_id, l]));

  return (
    <section className={styles.section}>
      <h2 className={styles.title}>Current Set</h2>
      <Legend />
      <div className={styles.grid}>
        {routes.map((route) => {
          const routeLog = logByRoute.get(route.id);
          return (
            <PunchTile
              key={route.id}
              number={route.number}
              state={deriveTileState(routeLog)}
              zone={routeLog?.zone}
              gradeLabel={routeLog?.grade_vote != null ? `V${routeLog.grade_vote}` : undefined}
              compact
            />
          );
        })}
      </div>
      <RouteChart
        logs={logByRoute}
        routeIds={routes.map((r) => r.id)}
        routeHasZone={routes.map((r) => r.has_zone)}
      />
    </section>
  );
}
