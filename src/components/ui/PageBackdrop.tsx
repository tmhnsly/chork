"use client";

import { usePathname } from "next/navigation";
import styles from "./pageBackdrop.module.scss";

/** Where the three lights sit, per kind of page. */
type Mood = "card" | "friends" | "games" | "board" | "profile" | "default";

function moodFor(pathname: string): Mood {
  if (pathname === "/") return "card";
  if (pathname.startsWith("/friends")) return "friends";
  if (pathname.startsWith("/match")) return "games";
  if (pathname.startsWith("/leaderboard")) return "board";
  if (pathname.startsWith("/u/") || pathname.startsWith("/profile")) return "profile";
  return "default";
}

/**
 * The app's ground: one fixed layer behind every page, lit by the
 * theme's own chord — accent, flash gold, a breath of zone colour.
 * Fixed, so it holds still while the page scrolls over it and the
 * navbar's glass always has the same light to blur.
 *
 * Each kind of page arranges the lights differently — the profile's
 * accent sits high and central behind the face, the board's gold
 * behind the podium, the games' pair in opposite corners — and the
 * positions are registered custom properties, so on a route change
 * the lights DRIFT to the new arrangement over the page fade rather
 * than cutting. That is the whole trick: three gradients, six
 * numbers, one transition.
 *
 * Decorative and non-interactive. Tokens only, so every theme and
 * both modes light it with their own colours.
 */
export function PageBackdrop() {
  const mood = moodFor(usePathname() ?? "/");
  return <div className={styles.backdrop} data-mood={mood} aria-hidden />;
}
