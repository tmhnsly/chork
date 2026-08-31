"use client";

import Link from "next/link";
import { FaUserPlus } from "react-icons/fa6";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { SheetBody, UserAvatar, Username } from "@/components/ui";
import type { Friend } from "@/lib/data/friend-queries";
import styles from "./friendsSheet.module.scss";

interface Props {
  open: boolean;
  friends: Friend[];
  onClose: () => void;
}

/**
 * The roster behind the profile's Friends stat. A list, not a
 * management screen — /friends owns requests, suggestions and the
 * board, and the footer link is how you get there.
 */
export function FriendsSheet({ open, friends, onClose }: Props) {
  const active = friends.filter((f) => f.status === "active");

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Friends"
      description="The climbers you compete with"
    >
      <SheetBody>
        {active.length === 0 ? (
          <p className={styles.empty}>
            No friends yet — a match is the quickest way to make one.
          </p>
        ) : (
          <ul className={styles.list}>
            {active.map((f) => (
              <li key={f.user_id}>
                <Link
                  href={`/u/${f.username ?? ""}`}
                  className={styles.row}
                  onClick={onClose}
                >
                  <UserAvatar
                    user={{
                      id: f.user_id,
                      username: f.username ?? "unknown",
                      name: f.name ?? f.username ?? "",
                      avatar_url: f.avatar_url ?? "",
                    }}
                    size="row"
                  />
                  <span className={styles.identity}>
                    <span className={styles.name}>
                      {f.name?.trim() || f.username || "Climber"}
                    </span>
                    {f.username && (
                      <Username username={f.username} className={styles.handle} />
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        <Link href="/friends" className={styles.footerLink} onClick={onClose}>
          <FaUserPlus aria-hidden />
          Find and manage friends
        </Link>
      </SheetBody>
    </BottomSheet>
  );
}
