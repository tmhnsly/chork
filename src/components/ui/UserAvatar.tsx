"use client";

import Image from "next/image";
import { FaRegUser } from "react-icons/fa6";
import type { Profile } from "@/lib/data";
import styles from "./userAvatar.module.scss";

interface Props {
  user: Pick<Profile, "id" | "avatar_url" | "name" | "username">;
  size?: number;
  className?: string;
  /** Flag above-the-fold avatars so the browser fetches them eagerly. */
  priority?: boolean;
}

/**
 * User avatar — uploaded image when present, otherwise an accent-
 * tinted circle with the outline user glyph.
 *
 * Uploaded JPEGs go through Next's image optimisation pipeline so
 * the CDN serves a width-appropriate variant rather than the
 * up-to-500KB original.
 */
export function UserAvatar({ user, size = 40, className, priority = false }: Props) {
  const src = user.avatar_url ?? null;

  // .empty flips the surface from the neutral mono pair to the
  // active theme's accent pair — picked up automatically from CSS
  // variables, no data plumbing required. The mono pair stays for
  // the image branch so an uploaded photo sits on a neutral plate
  // regardless of theme.
  const rootClass = [
    styles.root,
    !src ? styles.empty : "",
    className,
  ].filter(Boolean).join(" ");

  return (
    <div
      className={rootClass}
      style={{ "--avatar-size": `${size}px` } as React.CSSProperties}
    >
      {src ? (
        <Image
          src={src}
          alt={user.name || user.username}
          width={size}
          height={size}
          className={styles.image}
          priority={priority}
          fetchPriority={priority ? "high" : undefined}
        />
      ) : (
        <FaRegUser className={styles.icon} />
      )}
    </div>
  );
}
