"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { UserAvatar, shimmerStyles } from "@/components/ui";
import { fetchFollowers, fetchFollowing } from "@/lib/user-actions";
import type { FollowListUser } from "@/lib/data/queries";
import styles from "./followListSheet.module.scss";

export type FollowListMode = "followers" | "following";

interface Props {
  userId: string;
  mode: FollowListMode;
  onClose: () => void;
}

const TITLES: Record<FollowListMode, string> = {
  followers: "Followers",
  following: "Following",
};

const EMPTY: Record<FollowListMode, string> = {
  followers: "No followers yet",
  following: "Not following anyone yet",
};

export function FollowListSheet({ userId, mode, onClose }: Props) {
  const [users, setUsers] = useState<FollowListUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetcher = mode === "followers" ? fetchFollowers : fetchFollowing;
    fetcher(userId).then((result) => {
      if (cancelled) return;
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setUsers(result.users);
    });
    return () => { cancelled = true; };
  }, [userId, mode]);

  const title = TITLES[mode];

  return (
    <BottomSheet open onClose={onClose} title={title}>
      <div className={styles.body}>
        <h2 className={styles.heading}>{title}</h2>

        {users === null && !error && (
          <ul className={styles.list} aria-busy="true">
            {[0, 1, 2, 3].map((i) => (
              <li key={i} className={styles.row}>
                <div className={`${styles.avatarSkeleton} ${shimmerStyles.skeleton}`} />
                <div className={styles.textSkeletons}>
                  <span className={`${styles.lineSkeleton} ${shimmerStyles.skeleton}`} />
                  <span className={`${styles.lineSkeletonShort} ${shimmerStyles.skeleton}`} />
                </div>
              </li>
            ))}
          </ul>
        )}

        {error && <p className={styles.empty}>Couldn&apos;t load list. {error}</p>}

        {users !== null && users.length === 0 && (
          <p className={styles.empty}>{EMPTY[mode]}</p>
        )}

        {users !== null && users.length > 0 && (
          <ul className={styles.list} aria-label={title}>
            {users.map((u) => (
              <li key={u.id}>
                <Link
                  href={`/u/${u.username}`}
                  className={styles.row}
                  onClick={onClose}
                >
                  <UserAvatar user={u} size={44} />
                  <div className={styles.identity}>
                    <span className={styles.username}>@{u.username}</span>
                    {u.name && <span className={styles.name}>{u.name}</span>}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </BottomSheet>
  );
}
