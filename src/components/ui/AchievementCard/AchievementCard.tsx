"use client";

import { FaLock } from "react-icons/fa6";
import { ICON_MAP } from "@/lib/badge-icons";
import { badgeFamily, type BadgeStatus } from "@/lib/badges";
import { ProgressRing } from "@/components/ui/ProgressRing/ProgressRing";
import styles from "./achievementCard.module.scss";

interface Props {
  badge: BadgeStatus;
  onPress: (badge: BadgeStatus) => void;
}

/**
 * One achievement, as a card.
 *
 * The single shape an achievement wears anywhere in the app: the
 * profile shelf scrolls a row of these, the full catalogue lays them
 * out in a grid, and both hand the same tap to the same detail sheet.
 * The catalogue used to be full-width rows carrying the name,
 * description, progress bar and earned date all at once — too wide to
 * scan, and a different thing to look at than the shelf directly above
 * it. The detail belongs behind a tap; the card is the glance.
 *
 * Three states, and the colour is doing the talking:
 *
 *   earned    — the badge's family tint, filled
 *   progress  — mono circle with a family-coloured ring; deliberately
 *               NOT tinted, so a half-finished badge can't be mistaken
 *               for a finished one at a glance
 *   muted     — a locked one-off condition, or a secret
 *
 * Always a button. Every card opens the detail sheet, including the
 * locked and secret ones — "what do I have to do" is exactly the
 * question a locked badge provokes, and the old rows answered it for
 * nobody.
 */
export function AchievementCard({ badge, onPress }: Props) {
  const secret = badge.badge.isSecret && !badge.earned;
  const Icon = secret ? FaLock : ICON_MAP[badge.badge.icon];
  const name = secret ? "???" : badge.badge.name;

  const inProgress =
    !badge.earned && !secret && badge.badge.kind === "progress";
  const state: "earned" | "progress" | "muted" = badge.earned
    ? "earned"
    : inProgress
      ? "progress"
      : "muted";

  // Family tints an earned card and colours an in-progress ring. A
  // muted card has no family at all.
  const family = state === "muted" ? null : badgeFamily(badge.badge);
  const progress = inProgress && badge.progress !== null ? badge.progress : null;

  // Said out loud rather than shown: the ring is the visual, and a
  // screen reader gets the same fact as a percentage.
  const progressLabel =
    progress !== null ? ` ${Math.round(progress * 100)}% complete.` : "";

  return (
    <button
      type="button"
      onClick={() => onPress(badge)}
      className={[
        styles.card,
        styles[`card--${state}`],
        family ? styles[`card--${family}`] : "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label={
        `${name}. ` +
        (secret ? "Secret achievement." : badge.badge.description) +
        progressLabel
      }
    >
      <span className={styles.circle}>
        {progress !== null && (
          <ProgressRing progress={progress} family={family ?? "accent"} />
        )}
        <Icon aria-hidden />
      </span>
      <span className={styles.name}>{name}</span>
    </button>
  );
}
