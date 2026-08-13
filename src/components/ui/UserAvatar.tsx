"use client";

import Image from "next/image";
import { FaRegUser } from "react-icons/fa6";
import type { Profile } from "@/lib/data";
import { AVATAR_SIZES, type AvatarSize } from "./avatar-sizes";
import styles from "./userAvatar.module.scss";

interface Props {
  user: Pick<Profile, "id" | "avatar_url" | "name" | "username">;
  /**
   * Role name from the avatar scale — `row` for a list row, `hero`
   * for a profile header. Deliberately not a pixel number: passing
   * numbers is how the same list-row avatar ended up at 32, 36 and 40
   * in different corners of the app.
   */
  size?: AvatarSize;
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
export function UserAvatar({ user, size = "row", className, priority = false }: Props) {
  const src = user.avatar_url ?? null;
  const px = AVATAR_SIZES[size];

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
      style={{ "--avatar-size": `${px}px` } as React.CSSProperties}
    >
      {src ? (
        <Image
          src={src}
          alt={user.name || user.username}
          width={px}
          height={px}
          // Avatars are fixed-pixel UI chrome, never responsive.
          // Without `sizes`, Next's optimizer has to assume a wide
          // range and ships the 256-px variant for a 32-px slot —
          // ~10 KB of bandwidth per avatar wasted, which adds up
          // to hundreds of KB on a leaderboard / crew roster page.
          // Telling it the exact rendered width cuts the srcset
          // down to 1×/2× only.
          sizes={`${px}px`}
          className={styles.image}
          priority={priority}
          fetchPriority={priority ? "high" : undefined}
          // Eager, not Next's lazy default. Lazy defers the fetch
          // until after layout, which is what makes avatars visibly
          // pop in on a leaderboard or crew roster that was already
          // on screen when the page painted. The trade lazy exists to
          // make — bandwidth for long image feeds — doesn't apply
          // here: every avatar list in the app is bounded (top-N
          // leaderboards, crew rosters) and a `sizes`-constrained
          // 40px avatar is a couple of KB.
          // `priority` already implies eager, so only set it
          // otherwise — passing both makes Next warn.
          loading={priority ? undefined : "eager"}
        />
      ) : (
        <FaRegUser className={styles.icon} />
      )}
    </div>
  );
}
