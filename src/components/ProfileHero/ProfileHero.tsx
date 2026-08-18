import { UserAvatar } from "@/components/ui";
import { CountUpNumber } from "@/components/ui/CountUpNumber/CountUpNumber";
import { RevealText } from "@/components/motion";
import { ProfileActions } from "./ProfileActions";
import type { FriendStanding } from "@/lib/data/friend-queries";
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
  /** Null hides the line — a brand-new profile has no ratios to show. */
  ratios: {
    flashRate: number;
    pointsPerSend: number;
    completionRate: number;
    streakCurrent: number;
  } | null;
  standing: FriendStanding;
}

/**
 * The profile as one card: who this is, how they're doing, and what
 * you can do about it — the thing you'd screenshot.
 *
 * Replaces two things. The old header, whose visited-profile variant
 * had an empty action row where the owner's bell and gear sat, so
 * other people's profiles looked unfinished by construction. And the
 * "All Time" card: six identical grey rectangles with equal weight,
 * asking the reader to work out which mattered. It was the one surface
 * the tile language never reached.
 *
 * Three headline numbers, not nine. Points takes the accent because it
 * is the one number the whole app ranks on; flashes take the flash
 * amber, the same promise a route tile makes. The ratios become one
 * quiet line: context for the numbers, not headlines of their own.
 *
 * Matches `SectionCard`'s surface — same mixin, radius, padding — but
 * does not USE it, because that component owns a title header and this
 * card's title is the climber's face and handle.
 */
export function ProfileHero({ user, gymName, totals, ratios, standing }: Props) {
  return (
    <section className={styles.card} aria-label={`@${user.username}`}>
      <div className={styles.identity}>
        <UserAvatar user={user} size="hero" priority />
        <div className={styles.names}>
          <RevealText text={`@${user.username}`} as="h1" className={styles.username} />
          {(user.name || gymName) && (
            <p className={styles.meta}>
              {[user.name, gymName].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
      </div>

      <div className={styles.headline}>
        <div className={`${styles.stat} ${styles.statPrimary}`}>
          <span className={styles.value}><CountUpNumber value={totals.points} /></span>
          <span className={styles.label}>Points</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.value}><CountUpNumber value={totals.sends} /></span>
          <span className={styles.label}>Sends</span>
        </div>
        <div className={`${styles.stat} ${styles.statFlash}`}>
          <span className={styles.value}><CountUpNumber value={totals.flashes} /></span>
          <span className={styles.label}>Flashes</span>
        </div>
      </div>

      {ratios && totals.sends > 0 && (
        <p className={styles.ratios}>
          <span>{Math.round(ratios.flashRate * 100)}% flashed</span>
          <span aria-hidden>·</span>
          <span>{ratios.pointsPerSend.toFixed(1)} pts / send</span>
          <span aria-hidden>·</span>
          <span>{Math.round(ratios.completionRate * 100)}% completion</span>
          {ratios.streakCurrent > 0 && (
            <>
              <span aria-hidden>·</span>
              <span>{ratios.streakCurrent} set streak</span>
            </>
          )}
        </p>
      )}

      <ProfileActions userId={user.id} username={user.username} standing={standing} />
    </section>
  );
}
