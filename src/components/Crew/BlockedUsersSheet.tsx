"use client";

import { useEffect, useState, useTransition } from "react";
import { FaUserSlash } from "react-icons/fa6";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { UserAvatar, shimmerStyles, showToast } from "@/components/ui";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { getBlockedUsers, type BlockedRow } from "@/lib/data/crew-queries";
import { unblockUser } from "@/app/crew/actions";
import styles from "./blockedUsersSheet.module.scss";

interface Props {
  open: boolean;
  onClose: () => void;
  userId: string;
}

/**
 * Flat blocklist with per-row Unblock. Users search blocks either-way
 * filters these climbers out automatically, so this sheet is the one
 * canonical way back for the person who did the blocking.
 */
export function BlockedUsersSheet({ open, onClose, userId }: Props) {
  const [rows, setRows] = useState<BlockedRow[] | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const supabase = createBrowserSupabase();
      const data = await getBlockedUsers(supabase, userId);
      if (!cancelled) setRows(data);
    })();
    return () => { cancelled = true; };
  }, [open, userId]);

  function handleUnblock(row: BlockedRow) {
    startTransition(async () => {
      const res = await unblockUser(row.blocked_id);
      if ("error" in res) {
        showToast(res.error, "error");
        return;
      }
      setRows((prev) => (prev ?? []).filter((r) => r.id !== row.id));
      showToast(`Unblocked @${row.username}`, "info");
    });
  }

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Blocked climbers"
      description="Climbers you've blocked"
    >
      <div className={styles.body}>
        <h2 className={styles.heading}>Blocked climbers</h2>

        {rows === null ? (
          <ul className={styles.list} aria-busy="true">
            {[0, 1].map((i) => (
              <li key={i} className={`${styles.row} ${shimmerStyles.skeleton}`} />
            ))}
          </ul>
        ) : rows.length === 0 ? (
          <p className={styles.empty}>
            <FaUserSlash aria-hidden /> No one is blocked.
          </p>
        ) : (
          <ul className={styles.list}>
            {rows.map((row) => (
              <li key={row.id} className={styles.row}>
                <UserAvatar
                  user={{
                    id: row.blocked_id,
                    username: row.username,
                    name: "",
                    avatar_url: row.avatar_url,
                  }}
                  size={36}
                />
                <span className={styles.handle}>@{row.username}</span>
                <button
                  type="button"
                  className={styles.unblockBtn}
                  onClick={() => handleUnblock(row)}
                  disabled={pending}
                >
                  Unblock
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </BottomSheet>
  );
}
