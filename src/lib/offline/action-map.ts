import {
  updateAttempts,
  completeRoute,
  uncompleteRoute,
  toggleZone,
  updateGradeVote,
} from "@/app/(app)/actions";
import type { OfflineAction } from "./types";
import { mutationQueue } from "./mutation-queue";

type ActionFn = (...args: unknown[]) => Promise<unknown>;

const ACTION_MAP: Record<OfflineAction, ActionFn> = {
  updateAttempts: updateAttempts as ActionFn,
  completeRoute: completeRoute as ActionFn,
  uncompleteRoute: uncompleteRoute as ActionFn,
  toggleZone: toggleZone as ActionFn,
  updateGradeVote: updateGradeVote as ActionFn,
};

/** Wire the queue to the real server actions. Call once at app init. */
export function registerActionRunner(): void {
  mutationQueue.setActionRunner(async (action, args) => {
    const fn = ACTION_MAP[action];
    return fn(...args);
  });
}
