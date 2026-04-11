"use client";

import { useNetworkStatus } from "@/lib/offline";
import { Banner } from "@/components/ui/Banner";
import styles from "./offlineBanner.module.scss";

export function OfflineBanner() {
  const { isOnline, pendingCount, ready } = useNetworkStatus();

  if (!ready || (isOnline && pendingCount === 0)) return null;

  return (
    <div className={styles.wrapper} role="status" aria-live="polite" aria-atomic="true">
      {!isOnline ? (
        <Banner variant="warning">
          Offline{pendingCount > 0 ? ` — ${pendingCount} ${pendingCount === 1 ? "change" : "changes"} queued` : ""}
        </Banner>
      ) : (
        <Banner variant="info">
          Syncing {pendingCount} {pendingCount === 1 ? "change" : "changes"}...
        </Banner>
      )}
    </div>
  );
}
