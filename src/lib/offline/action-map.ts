import {
  updateAttempts,
  completeRoute,
  uncompleteRoute,
  toggleZone,
  updateGradeVote,
} from "@/app/(app)/actions";
import { createBrowserSupabase } from "@/lib/supabase/client";
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

/**
 * Wire the queue to the real server actions + the current-user
 * resolver it uses to tag + filter queued mutations. Call once at
 * app init.
 *
 * `getSession()` reads local storage (no network), so the resolver
 * stays cheap enough to call on every enqueue / flush.
 */
export function registerActionRunner(): void {
  mutationQueue.setActionRunner(async (action, args) => {
    const fn = ACTION_MAP[action];
    return fn(...args);
  });
  mutationQueue.setCurrentUserResolver(async () => {
    const supabase = createBrowserSupabase();
    const { data: { session } } = await supabase.auth.getSession();
    return session?.user?.id ?? null;
  });
}
