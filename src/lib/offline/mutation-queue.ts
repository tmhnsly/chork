import { openOfflineDB, STORE_NAME, type OfflineDB } from "./db";
import type { QueuedMutation, OfflineAction } from "./types";

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
];

class MutationQueue {
  private dbPromise: Promise<OfflineDB> | null = null;
  private flushing = false;
  private listeners = new Set<Listener>();
  private actionRunner: ((action: OfflineAction, args: unknown[]) => Promise<unknown>) | null = null;

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

  async enqueue(mutation: Omit<QueuedMutation, "id" | "createdAt" | "retries">): Promise<void> {
    const db = await this.getDB();

    // Compact before writing
    await this.compact(db, mutation.routeId, mutation.action);

    const entry: QueuedMutation = {
      ...mutation,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      retries: 0,
    };

    await db.put(STORE_NAME, entry);
    this.notify();
  }

  async count(): Promise<number> {
    const db = await this.getDB();
    return db.count(STORE_NAME);
  }

  async flush(): Promise<void> {
    if (this.flushing || !this.actionRunner) return;
    this.flushing = true;

    try {
      const db = await this.getDB();
      const entries = await db.getAllFromIndex(STORE_NAME, "createdAt");

      for (const entry of entries) {
        if (!navigator.onLine) break;

        try {
          const result = await this.actionRunner(entry.action, entry.args);

          // Check for server-side errors
          if (result && typeof result === "object" && "error" in result) {
            const error = (result as { error: string }).error;

            if (error.includes("signed in") || error.includes("authenticated")) {
              // Auth error — stop flushing, user needs to re-authenticate
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
   * become 1 server call on reconnect.
   */
  private async compact(db: OfflineDB, routeId: string, action: OfflineAction): Promise<void> {
    const existing = await db.getAllFromIndex(STORE_NAME, "routeId", routeId);

    const toDelete: string[] = [];

    if (LAST_WRITE_WINS.includes(action)) {
      // Only keep the latest — delete older entries of the same action
      for (const entry of existing) {
        if (entry.action === action) {
          toDelete.push(entry.id);
        }
      }
    } else if (action === "completeRoute") {
      // Completion carries attempts, zone, and grade — supersede those
      for (const entry of existing) {
        if (SUPERSEDED_BY_COMPLETE.includes(entry.action)) {
          toDelete.push(entry.id);
        }
      }
    } else if (action === "uncompleteRoute") {
      // Uncompletion cancels out completions and grade votes
      for (const entry of existing) {
        if (SUPERSEDED_BY_UNCOMPLETE.includes(entry.action)) {
          toDelete.push(entry.id);
        }
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
