"use client";

import { useState, useTransition } from "react";
import { FaUserPlus, FaUserCheck } from "react-icons/fa6";
import { followUser } from "@/app/(app)/actions";
import { Button } from "@/components/ui";
import styles from "./followButton.module.scss";

interface Props {
  targetUserId: string;
  initialFollowing: boolean;
  onFollowChange: (following: boolean, serverFollowerCount: number | null) => void;
}

export function FollowButton({ targetUserId, initialFollowing, onFollowChange }: Props) {
  const [following, setFollowing] = useState(initialFollowing);
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    const wasFollowing = following;
    const nowFollowing = !wasFollowing;

    // Optimistic update
    setFollowing(nowFollowing);
    onFollowChange(nowFollowing, null); // null = optimistic, parent uses delta

    startTransition(async () => {
      const result = await followUser(targetUserId);
      if ("error" in result) {
        // Revert to pre-click state
        setFollowing(wasFollowing);
        onFollowChange(wasFollowing, null);
        return;
      }
      // Sync with server truth
      setFollowing(result.following);
      onFollowChange(result.following, result.followerCount);
    });
  }

  return (
    <Button
      variant={following ? "secondary" : "primary"}
      onClick={handleClick}
      disabled={isPending}
      className={styles.followBtn}
      aria-label={following ? "Unfollow" : "Follow"}
    >
      {following ? <FaUserCheck /> : <FaUserPlus />}
      {following ? "Following" : "Follow"}
    </Button>
  );
}
