export type { OfflineAction } from "./registry";
import type { OfflineAction } from "./registry";

export interface QueuedMutation {
  id: string;
  /**
   * The user who queued the mutation. Captured at enqueue time so a
   * shared-device flow (User A queues offline → signs out → User B
   * signs in) can't accidentally flush User A's writes under User B's
   * auth cookies. Flush filters by current user; sign-out clears the
   * outgoing user's entries outright.
   */
  userId: string;
  action: OfflineAction;
  args: unknown[];
  /**
   * Dedupe key for compaction — the id of the thing being mutated.
   * Gym actions use `routes.id`; jam log actions use
   * `jam_routes.id`. Both are UUIDs so the namespace is shared
   * without collision risk.
   */
  routeId: string;
  createdAt: number;
  retries: number;
}
