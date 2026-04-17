export const OFFLINE_ACTIONS = [
  "updateAttempts",
  "completeRoute",
  "uncompleteRoute",
  "toggleZone",
  "updateGradeVote",
  // Jam logs reuse the offline pipeline. They upsert on
  // (user_id, jam_route_id) server-side so replay is idempotent,
  // matching the route_log contract.
  "upsertJamLog",
] as const;

export type OfflineAction = (typeof OFFLINE_ACTIONS)[number];

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
