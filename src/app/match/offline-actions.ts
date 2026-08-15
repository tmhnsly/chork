import { withOfflineQueue } from "@/lib/offline/with-offline-queue";
import { upsertMatchLogAction } from "./actions";

/**
 * Offline-queue-aware wrapper around `upsertMatchLogAction`.
 *
 * Match screens call this from the log sheet instead of the raw
 * server action so a climber logging sends on flaky wifi at the
 * gym sees their tiles flip immediately and the writes replay
 * when connection comes back.
 *
 * The dedupe key is (owner, route), not route alone. Successive logs
 * for the same route by the same person compact via the
 * `LAST_WRITE_WINS` list in `mutation-queue.ts` — but a host mid-match
 * may queue their OWN send on a route and a guest's send on the same
 * route, and keying on the route alone would collapse the two and
 * drop one of them. `playerId` is absent for your own card, so
 * "self" stands in for it.
 */
export const upsertMatchLogOffline = withOfflineQueue(
  "upsertMatchLog",
  upsertMatchLogAction,
  (payload) => `${payload.playerId ?? "self"}:${payload.matchRouteId}`,
);
