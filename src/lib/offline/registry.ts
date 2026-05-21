import {
  updateAttempts,
  completeRoute,
  uncompleteRoute,
  toggleZone,
  updateGradeVote,
} from "@/app/(app)/route-log-actions";
import { upsertJamLogAction } from "@/app/jam/actions";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { mutationQueue } from "./mutation-queue";

/**
 * Single source of truth for offline-capable server actions. Keys are the
 * action names persisted in IndexedDB (don't rename without a migration);
 * values are the real action functions invoked when a queued mutation
 * replays.
 *
 * The OfflineAction type is derived from these keys — adding a new entry
 * here is the only edit needed; the queue's flush path picks it up via
 * the shared dispatch table.
 */
const ACTION_REGISTRY = {
  updateAttempts,
  completeRoute,
  uncompleteRoute,
  toggleZone,
  updateGradeVote,
  // Jam logs reuse the offline pipeline. They upsert on
  // (user_id, jam_route_id) server-side so replay is idempotent,
  // matching the route_log contract.
  upsertJamLog: upsertJamLogAction,
} as const;

export type OfflineAction = keyof typeof ACTION_REGISTRY;

type ActionFn = (...args: unknown[]) => Promise<unknown>;

/**
 * Wire the queue to the registered server actions + the current-user
 * resolver it uses to tag + filter queued mutations. Call once at app
 * init.
 *
 * `getSession()` reads local storage (no network), so the resolver
 * stays cheap enough to call on every enqueue / flush.
 */
export function registerActionRunner(): void {
  mutationQueue.setActionRunner(async (action, args) => {
    // Dispatcher cast: each registered action has a different
    // signature, but the queue calls them uniformly via the
    // `(...args: unknown[])` shape. Safe because the queue captured
    // `args` from the same call site that knows the action's real
    // signature — they're persisted together and replayed together.
    // If a future action accepts an arg shape that can't round-trip
    // through `structuredClone` (e.g. functions, classes), validate
    // here before dispatch.
    const fn = ACTION_REGISTRY[action] as unknown as ActionFn;
    return fn(...args);
  });
  mutationQueue.setCurrentUserResolver(async () => {
    const supabase = createBrowserSupabase();
    const { data: { session } } = await supabase.auth.getSession();
    return session?.user?.id ?? null;
  });
}
