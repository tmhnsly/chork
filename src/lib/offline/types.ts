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
  action: OfflineAction;
  args: unknown[];
  routeId: string;
  createdAt: number;
  retries: number;
}
