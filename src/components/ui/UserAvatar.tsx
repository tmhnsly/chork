"use client";

import Image from "next/image";
import { FaUser } from "react-icons/fa6";
import type { Profile } from "@/lib/data";
import { getAvatarUrl } from "@/lib/avatar";
import styles from "./userAvatar.module.scss";

type AvatarColour = "brand" | "flash" | "teal";

interface Props {
  user: Pick<Profile, "id" | "avatar_url" | "name" | "username">;
  size?: number;
  className?: string;
}

/** Deterministic colour from user ID. */
function getUserColour(userId: string): AvatarColour {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) - hash + userId.charCodeAt(i)) | 0;
  }
  const colours: AvatarColour[] = ["brand", "flash", "teal"];
  return colours[Math.abs(hash) % colours.length];
}

/**
 * User avatar - shows image if available, otherwise a coloured
 * circle with FaUser icon. Colour is deterministic from user ID.
 */
export function UserAvatar({ user, size = 40, className }: Props) {
  const colour = getUserColour(user.id);
  const hasImage = !!user.avatar_url;
  const src = hasImage ? getAvatarUrl(user, { size: size * 2 }) : null;

  return (
    <div
      className={[styles.root, !hasImage && styles[colour], className].filter(Boolean).join(" ")}
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
        />
      ) : (
        <FaUser className={styles.icon} />
      )}
    </div>
  );
}
