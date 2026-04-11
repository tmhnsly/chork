import { openDB, type IDBPDatabase } from "idb";

const DB_NAME = "chork-offline";
const DB_VERSION = 1;
const STORE_NAME = "mutations";

export type OfflineDB = IDBPDatabase;

export { STORE_NAME };

export function openOfflineDB(): Promise<OfflineDB> {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
      store.createIndex("routeId", "routeId", { unique: false });
      store.createIndex("createdAt", "createdAt", { unique: false });
    },
  });
}
