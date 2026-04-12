import { PunchTile } from "@/components/PunchTile/PunchTile";
import { deriveTileState } from "@/lib/data";
import type { RouteLog } from "@/lib/data";
import styles from "./sendsGridThumbnail.module.scss";

type ThumbnailLog = Pick<RouteLog, "attempts" | "completed" | "zone">;

interface Props {
  routes: Array<{ id: string; number: number; has_zone: boolean }>;
  logs: Map<string, ThumbnailLog>;
  className?: string;
}

/**
 * Read-only mini sends grid. Compact tiles, no interaction.
 * Uses the same tile rendering + state derivation as the wall so
 * colours stay in sync.
 */
export function SendsGridThumbnail({ routes, logs, className }: Props) {
  if (routes.length === 0) return null;
  return (
    <div
      className={[styles.grid, className].filter(Boolean).join(" ")}
      aria-hidden="true"
    >
      {routes.map((route) => {
        const log = logs.get(route.id);
        return (
          <PunchTile
            key={route.id}
            number={route.number}
            state={deriveTileState(log as RouteLog | undefined)}
            zone={log?.zone}
            compact
          />
        );
      })}
    </div>
  );
}
