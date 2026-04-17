export const OFFLINE_ACTIONS = [
  "updateAttempts",
  "completeRoute",
  "uncompleteRoute",
  "toggleZone",
  "updateGradeVote",
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
  routeId: string;
  createdAt: number;
  retries: number;
}
