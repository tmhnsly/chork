"use client";

import Image from "next/image";
import { FaRegUser } from "react-icons/fa6";
import type { Profile } from "@/lib/data";
import { getAvatarUrl } from "@/lib/avatar";
import styles from "./userAvatar.module.scss";

interface Props {
  user: Pick<Profile, "id" | "avatar_url" | "name" | "username">;
  size?: number;
  className?: string;
  /** Flag above-the-fold avatars so the browser fetches them eagerly. */
  priority?: boolean;
}

/**
 * User avatar - shows image if available, otherwise a mono
 * circle with outline user icon.
 */
export function UserAvatar({ user, size = 40, className, priority = false }: Props) {
  const hasImage = !!user.avatar_url;
  const src = hasImage ? getAvatarUrl(user, { size: size * 2 }) : null;

  return (
    <div
      className={[styles.root, className].filter(Boolean).join(" ")}
      style={{ width: size, height: size }}
    >
      {src ? (
        <Image
          src={src}
          alt={user.name || user.username}
          width={size}
          height={size}
          className={styles.image}
          unoptimized
          priority={priority}
          fetchPriority={priority ? "high" : undefined}
        />
      ) : (
        <FaRegUser className={styles.icon} />
      )}
    </div>
  );
}
