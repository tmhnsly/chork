import { FaBolt, FaCheck, FaFire, FaLocationDot, FaRankingStar } from "react-icons/fa6";
import { UserAvatar } from "@/components/ui";
import { CountUpNumber } from "@/components/ui/CountUpNumber/CountUpNumber";
import { RevealText } from "@/components/motion";
import { ProfileActions } from "./ProfileActions";
import { SettingsCorner } from "./SettingsCorner";
import type { FriendStanding, Friend } from "@/lib/data/friend-queries";
import styles from "./profileHero.module.scss";

interface Props {
  user: {
    id: string;
    username: string;
    name: string;
    avatar_url: string;
  };
  gymName: string | null;
  totals: { points: number; sends: number; flashes: number };
  /** Placement on the gym's active set — null when unranked or gymless. */
  rank: number | null;
  /** Consecutive sets with a send; the chip renders from 2 up. */
  streakCurrent: number;
  standing: FriendStanding;
  /** Own profile only — see ProfileActions. */
  friends?: Friend[];
}

/**
 * The profile as one card: who this is, how they're doing, and what
 * you can do about it — the thing you'd screenshot.
 *
 * Second pass (2026-08-31). The first version was three grey boxes in
 * a grey box with a paragraph of percentages — accurate and flat. What
 * changed, and why:
 *
 *   • The identity row is a POSTER COVER: full-bleed, brand-fixed
 *     near-black (the accent finally has something to pop against in
 *     the light scheme), the avatar ringed in the climber's accent.
 *     The first pass used an inset step-3 wash — a box in a box that
 *     vanished on white.
 *   • The meta line grew into chips, and the FIRST chip is the one
 *     number the whole app ranks on and the old hero never showed:
 *     placement on the current set. Rank wears solid accent — the
 *     "you did this" treatment. Gym and streak chips stay muted.
 *   • The ratios paragraph is gone; streak survives as a chip. Rates
 *     live in the stats card and set sheets.
 *   • Tiles are SOLID step-9 fills — Points lime, Flashes amber, the
 *     route-tile treatment on the numbers that summarise them — and
 *     Sends gets a real border so it exists on a white card. Flashes
 *     and Sends carry their glyphs; Points carries none, because the
 *     accent fill IS its mark.
 *   • Settings moved to the identity corner where chrome belongs; the
 *     action row below is purely social now.
 */
export function ProfileHero({
  user,
  gymName,
  totals,
  rank,
  streakCurrent,
  standing,
  friends,
}: Props) {
  const hasChips = rank !== null || gymName !== null || streakCurrent > 1;
  // "TOM" under "@TOM" is the same word twice — the meta line only
  // earns its row when the display name says something the handle
  // doesn't.
  const showName =
    user.name.trim().length > 0 &&
    user.name.trim().toLowerCase() !== user.username.toLowerCase();

  return (
    <section className={styles.card} aria-label={`@${user.username}`}>
      <div className={styles.identity}>
        <span className={styles.avatarRing}>
          <UserAvatar user={user} size="hero" priority />
        </span>
        <div className={styles.names}>
          <RevealText text={`@${user.username}`} as="h1" className={styles.username} />
          {showName && <p className={styles.meta}>{user.name}</p>}
          {hasChips && (
            <ul className={styles.chips} aria-label="Standing">
              {rank !== null && (
                <li className={`${styles.chip} ${styles.chipRank}`}>
                  <FaRankingStar aria-hidden />
                  #{rank}
                  <span className={styles.chipQual}>this set</span>
                </li>
              )}
              {gymName && (
                <li className={styles.chip}>
                  <FaLocationDot aria-hidden />
                  {gymName}
                </li>
              )}
              {streakCurrent > 1 && (
                <li className={styles.chip}>
                  <FaFire aria-hidden />
                  {streakCurrent} set streak
                </li>
              )}
            </ul>
          )}
        </div>
        {standing.status === "self" && (
          <div className={styles.corner}>
            <SettingsCorner />
          </div>
        )}
      </div>

      <div className={styles.headline}>
        <div className={`${styles.stat} ${styles.statPrimary}`}>
          <span className={styles.value}><CountUpNumber value={totals.points} /></span>
          <span className={styles.label}>Points</span>
        </div>
        <div className={`${styles.stat} ${styles.statFlash}`}>
          <span className={styles.value}><CountUpNumber value={totals.flashes} /></span>
          <span className={styles.label}>
            <FaBolt aria-hidden />
            Flashes
          </span>
        </div>
        <div className={styles.stat}>
          <span className={styles.value}><CountUpNumber value={totals.sends} /></span>
          <span className={styles.label}>
            <FaCheck aria-hidden />
            Sends
          </span>
        </div>
      </div>

      <ProfileActions
        userId={user.id}
        username={user.username}
        standing={standing}
        friends={friends}
      />
    </section>
  );
}
