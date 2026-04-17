import { withOfflineQueue } from "@/lib/offline/with-offline-queue";
import { upsertJamLogAction } from "./actions";

/**
 * Offline-queue-aware wrapper around `upsertJamLogAction`.
 *
 * Jam screens call this from the log sheet instead of the raw
 * server action so a climber logging sends on flaky wifi at the
 * gym sees their tiles flip immediately and the writes replay
 * when connection comes back. Extracts `jamRouteId` as the dedupe
 * key — successive logs for the same route compact via the
 * `LAST_WRITE_WINS` list in `mutation-queue.ts`.
 */
export const upsertJamLogOffline = withOfflineQueue(
  "upsertJamLog",
  upsertJamLogAction,
  (payload) => payload.jamRouteId,
);
