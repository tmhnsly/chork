import { openDB, type IDBPDatabase } from "idb";

const DB_NAME = "chork-offline";
// v1 → v2: added `userId` field + index on queued mutations so flush
// and signout can scope entries to the user that enqueued them.
// Upgrade drops the old store — any pre-upgrade entries can't be
// retrofitted with a user (we don't know whose they are), and
// silently flushing them under the current user was exactly the bug
// we're fixing.
const DB_VERSION = 2;
const STORE_NAME = "mutations";

export type OfflineDB = IDBPDatabase;

export { STORE_NAME };

export function openOfflineDB(): Promise<OfflineDB> {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      if (oldVersion < 2 && db.objectStoreNames.contains(STORE_NAME)) {
        db.deleteObjectStore(STORE_NAME);
      }
      const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
      store.createIndex("routeId", "routeId", { unique: false });
      store.createIndex("createdAt", "createdAt", { unique: false });
      store.createIndex("userId", "userId", { unique: false });
    },
  });
}
