import Link from "next/link";
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
 *   • The identity block is the app's BIGGEST TILE: full-bleed
 *     accent-solid with on-solid ink — the sent-route treatment at
 *     card scale, colourful in both schemes, themed for free. (An
 *     inset wash, a hardcoded black cover and a light-dark() derived
 *     one were each tried; the system's own tile answer beat all
 *     three.)
 *   • The meta line grew into chips, and the FIRST chip is the one
 *     number the whole app ranks on and the old hero never showed:
 *     placement on the current set. Rank wears solid accent — the
 *     "you did this" treatment. Gym and streak chips stay muted.
 *   • The ratios paragraph is gone; streak survives as a chip. Rates
 *     live in the stats card and set sheets.
 *   • The scoreboard is ON the tile — numbers as one-ink type with
 *     hairline dividers (a second step-9 hue on a step-9 ground
 *     vibrates). Boxes under the cover were the last of the
 *     box-in-box habit.
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
      <div className={styles.poster}>
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
                <li>
                  {/* The one chip that's a control: your standing is a
                      tap from your face. Everything else up here is a
                      fact. */}
                  <Link
                    href="/leaderboard"
                    className={`${styles.chip} ${styles.chipRank}`}
                  >
                    <FaRankingStar aria-hidden />
                    #{rank}
                    <span className={styles.chipQual}>this set</span>
                  </Link>
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

      {/* The scoreboard lives ON the cover — numbers as type on the
          slab, not boxes under it. Points wears the theme's neon,
          flashes its gold, sends stays plain; hairline dividers do
          the separating. */}
      <div className={styles.scoreboard}>
        <div className={styles.score}>
          <span className={styles.scoreValue}>
            <CountUpNumber value={totals.points} />
          </span>
          <span className={styles.scoreLabel}>Points</span>
        </div>
        <div className={styles.score}>
          <span className={styles.scoreValue}>
            <CountUpNumber value={totals.flashes} />
          </span>
          <span className={styles.scoreLabel}>
            <FaBolt aria-hidden />
            Flashes
          </span>
        </div>
        <div className={styles.score}>
          <span className={styles.scoreValue}>
            <CountUpNumber value={totals.sends} />
          </span>
          <span className={styles.scoreLabel}>
            <FaCheck aria-hidden />
            Sends
          </span>
        </div>
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
