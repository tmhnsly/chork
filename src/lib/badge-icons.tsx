"use client";

/**
 * Badge icon registry — maps the serialisable `BadgeIcon` ID stored
 * on each `BadgeDefinition` to the actual React component that
 * renders it. Lives in its own module (rather than inside
 * `BadgeShelf`) so toasts and other lightweight surfaces can render
 * the icon without pulling the shelf's sheet/animation tree into
 * their bundle.
 *
 * Adding an icon: extend `BadgeIcon` in `src/lib/badges.ts`, then
 * add the mapping here (and only here).
 */

import {
  FaBolt,
  FaFire,
  FaMountainSun,
  FaTrophy,
  FaStar,
  FaBroom,
  FaMoon,
  FaUsers,
  FaUserPlus,
  FaCrown,
  FaFrog,
  FaFlag,
} from "react-icons/fa6";
import type { BadgeIcon } from "@/lib/badges";
import styles from "./badge-icons.module.scss";

// Text-icon factory for the nursery-rhyme pair achievements.
// Renders the number pair (e.g. "1,2") as tight mono text in the
// badge's icon slot — more legible than cramming two glyphs in.
function makePairIcon(text: string): React.ComponentType {
  const Icon = () => <span className={styles.iconText}>{text}</span>;
  Icon.displayName = `PairIcon(${text})`;
  return Icon;
}

export const ICON_MAP: Record<BadgeIcon, React.ComponentType> = {
  bolt: FaBolt,
  fire: FaFire,
  mountain: FaMountainSun,
  trophy: FaTrophy,
  star: FaStar,
  broom: FaBroom,
  moon: FaMoon,
  "fire-streak": FaFire,
  users: FaUsers,
  "user-plus": FaUserPlus,
  crown: FaCrown,
  frog: FaFrog,
  flag: FaFlag,
  "num-1-2": makePairIcon("1,2"),
  "num-3-4": makePairIcon("3,4"),
  "num-5-6": makePairIcon("5,6"),
  "num-7-8": makePairIcon("7,8"),
  "num-9-10": makePairIcon("9,10"),
};
