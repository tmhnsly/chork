import { openOfflineDB, STORE_NAME, type OfflineDB } from "./db";
import type { QueuedMutation, OfflineAction } from "./types";
import { isAuthRequiredError } from "@/lib/auth-errors";

type Listener = (count: number) => void;

const MAX_RETRIES = 3;

// Actions that are superseded when a completeRoute is queued for the same route
const SUPERSEDED_BY_COMPLETE: OfflineAction[] = [
  "updateAttempts",
  "toggleZone",
  "updateGradeVote",
];

// Actions that are superseded when an uncompleteRoute is queued
const SUPERSEDED_BY_UNCOMPLETE: OfflineAction[] = [
  "completeRoute",
  "updateGradeVote",
];

// Actions where only the latest value per route matters
const LAST_WRITE_WINS: OfflineAction[] = [
  "updateAttempts",
  "toggleZone",
  "updateGradeVote",
  // Jam log upserts are idempotent on (user_id, jam_route_id)
  // server-side — replaying an older one would stomp newer state,
  // so compact to the most recent per jam route.
  "upsertJamLog",
];

class MutationQueue {
  private dbPromise: Promise<OfflineDB> | null = null;
  private flushing = false;
  private listeners = new Set<Listener>();
  private actionRunner: ((action: OfflineAction, args: unknown[]) => Promise<unknown>) | null = null;
  private currentUserResolver: (() => Promise<string | null>) | null = null;

  private getDB(): Promise<OfflineDB> {
    if (!this.dbPromise) {
      this.dbPromise = openOfflineDB();
    }
    return this.dbPromise;
  }

  /** Register the function that executes server actions during flush. */
  setActionRunner(runner: (action: OfflineAction, args: unknown[]) => Promise<unknown>): void {
    this.actionRunner = runner;
  }

  /**
   * Register a resolver the queue calls (pre-enqueue, pre-flush) to
   * learn who's currently signed in. Injected from a client-only
   * bootstrap so the queue module itself stays auth-agnostic + tree-
   * shakes cleanly in server builds.
   */
  setCurrentUserResolver(resolver: () => Promise<string | null>): void {
    this.currentUserResolver = resolver;
  }

  /**
   * Enqueue skips when no user is resolved — queuing anonymous
   * mutations would just fail on flush anyway, and the extra
   * IndexedDB write keeps growing the user's storage quota for no
   * reason. Returns false so callers can fall through to a sync
   * error path if needed.
   */
  async enqueue(
    mutation: Omit<QueuedMutation, "id" | "userId" | "createdAt" | "retries">,
  ): Promise<boolean> {
    const userId = await this.currentUserResolver?.();
    if (!userId) return false;

    const db = await this.getDB();

    // Compact before writing
    await this.compact(db, mutation.routeId, mutation.action, userId);

    const entry: QueuedMutation = {
      ...mutation,
      id: crypto.randomUUID(),
      userId,
      createdAt: Date.now(),
      retries: 0,
    };

    await db.put(STORE_NAME, entry);
    this.notify();
    return true;
  }

  async count(): Promise<number> {
    const db = await this.getDB();
    return db.count(STORE_NAME);
  }

  /**
   * Wipe every queued mutation belonging to `userId`. Called from
   * the signout flow so a shared device doesn't carry User A's
   * queued writes into User B's session.
   */
  async clearForUser(userId: string): Promise<void> {
    const db = await this.getDB();
    const entries = await db.getAllFromIndex(STORE_NAME, "userId", userId);
    if (entries.length === 0) return;
    const tx = db.transaction(STORE_NAME, "readwrite");
    for (const entry of entries) {
      tx.store.delete(entry.id);
    }
    await tx.done;
    this.notify();
  }

  async flush(): Promise<void> {
    if (this.flushing || !this.actionRunner) return;
    this.flushing = true;

    try {
      const db = await this.getDB();
      const entries = await db.getAllFromIndex(STORE_NAME, "createdAt");
      // Belt-and-braces: filter out entries that don't belong to the
      // currently-signed-in user. Normally signOut already cleared
      // those, but an anonymous flush window or a user-change via a
      // different tab could leave stragglers. Running them would post
      // User A's writes under User B's auth cookies — exactly what
      // this whole tagging pass exists to prevent.
      const currentUserId = await this.currentUserResolver?.();
      const runnable = currentUserId
        ? entries.filter((e) => e.userId === currentUserId)
        : [];

      for (const entry of runnable) {
        if (!navigator.onLine) break;

        try {
          const result = await this.actionRunner(entry.action, entry.args);

          // Check for server-side errors
          if (result && typeof result === "object" && "error" in result) {
            const error = (result as { error: string }).error;

            // Auth sentinel match — stop flushing so we don't retry
            // every queued mutation under fresh unauth cookies. The
            // previous substring match (`.includes("signed in")`)
            // silently drifted every time wording changed in auth.ts;
            // the shared `AUTH_REQUIRED_ERROR` constant is the source
            // of truth on both sides now.
            if (isAuthRequiredError(error)) {
              break;
            }

            // Validation or other server error — retry or discard
            entry.retries++;
            if (entry.retries >= MAX_RETRIES) {
              await db.delete(STORE_NAME, entry.id);
            } else {
              await db.put(STORE_NAME, entry);
            }
            this.notify();
            continue;
          }

          // Success — remove from queue
          await db.delete(STORE_NAME, entry.id);
          this.notify();
        } catch (err) {
          if (err instanceof TypeError) {
            // Network error — stop flushing, wait for connectivity
            break;
          }
          // Unexpected error — retry or discard
          entry.retries++;
          if (entry.retries >= MAX_RETRIES) {
            await db.delete(STORE_NAME, entry.id);
          } else {
            await db.put(STORE_NAME, entry);
          }
          this.notify();
        }
      }
    } finally {
      this.flushing = false;
    }
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private async notify(): Promise<void> {
    const c = await this.count();
    for (const listener of this.listeners) {
      listener(c);
    }
  }

  /**
   * Remove entries that would be superseded by the new mutation.
   * Keeps the queue compact — e.g., 20 attempt changes offline
   * become 1 server call on reconnect. Scoped to the enqueueing
   * user so User A's in-flight queue can't be pruned by a pending
   * User B compaction (shared device, quick user switch).
   */
  private async compact(
    db: OfflineDB,
    routeId: string,
    action: OfflineAction,
    userId: string,
  ): Promise<void> {
    const existing = await db.getAllFromIndex(STORE_NAME, "routeId", routeId);

    const toDelete: string[] = [];

    for (const entry of existing) {
      if (entry.userId !== userId) continue;

      if (LAST_WRITE_WINS.includes(action) && entry.action === action) {
        toDelete.push(entry.id);
      } else if (action === "completeRoute" && SUPERSEDED_BY_COMPLETE.includes(entry.action)) {
        // Completion carries attempts, zone, and grade — supersede those.
        toDelete.push(entry.id);
      } else if (action === "uncompleteRoute" && SUPERSEDED_BY_UNCOMPLETE.includes(entry.action)) {
        // Uncompletion cancels out completions and grade votes.
        toDelete.push(entry.id);
      }
    }

    const tx = db.transaction(STORE_NAME, "readwrite");
    for (const id of toDelete) {
      tx.store.delete(id);
    }
    await tx.done;
  }
}

/** Module-level singleton — shared between wrapper functions and React hooks. */
export const mutationQueue = new MutationQueue();
