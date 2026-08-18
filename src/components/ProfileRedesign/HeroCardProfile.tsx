import { UserAvatar } from "@/components/ui";
import { CountUpNumber } from "@/components/ui/CountUpNumber/CountUpNumber";
import { ProfileActions } from "./ProfileActions";
import type { ProfileMockData } from "./types";
import styles from "./heroCardProfile.module.scss";

/**
 * Variant A — the profile as one card.
 *
 * Identity, the numbers that matter and what you can do about this
 * climber fuse into a single surface: the thing you would screenshot
 * and send to the group chat. Everything below it stays sectioned as
 * it is today.
 *
 * Three headline numbers, not nine. The current all-time block shows
 * six equal grey boxes and asks the reader to work out which matters —
 * so this picks (points, sends, flashes) and demotes the derived ratios
 * to a single quiet line. A profile answers "how are they doing"
 * before it answers "what is their points-per-send".
 */
export function HeroCardProfile({ data }: { data: ProfileMockData }) {
  return (
    <section className={styles.card}>
      <div className={styles.identity}>
        <UserAvatar
          user={{
            id: "mock",
            username: data.username,
            name: data.name,
            avatar_url: data.avatarUrl,
          }}
          size="hero"
        />
        <div className={styles.names}>
          <h1 className={styles.username}>@{data.username}</h1>
          <p className={styles.meta}>
            {[data.name, data.gymName].filter(Boolean).join(" · ")}
          </p>
        </div>
      </div>

      {/* The accent belongs to points: it is the one number the whole
          app ranks on. Flashes take the flash amber, which is the same
          promise the route tiles make. */}
      <div className={styles.headline}>
        <div className={`${styles.stat} ${styles.statPrimary}`}>
          <span className={styles.value}><CountUpNumber value={data.points} /></span>
          <span className={styles.label}>Points</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.value}><CountUpNumber value={data.sends} /></span>
          <span className={styles.label}>Sends</span>
        </div>
        <div className={`${styles.stat} ${styles.statFlash}`}>
          <span className={styles.value}><CountUpNumber value={data.flashes} /></span>
          <span className={styles.label}>Flashes</span>
        </div>
      </div>

      {/* The ratios, said once and quietly. They are context for the
          numbers above, not headlines of their own. */}
      <p className={styles.ratios}>
        <span>{Math.round(data.flashRate * 100)}% flashed</span>
        <span aria-hidden>·</span>
        <span>{data.pointsPerSend.toFixed(1)} pts / send</span>
        <span aria-hidden>·</span>
        <span>{Math.round(data.completionRate * 100)}% completion</span>
        {data.streakBest > 0 && (
          <>
            <span aria-hidden>·</span>
            <span>{data.streakCurrent} set streak</span>
          </>
        )}
      </p>

      <ProfileActions relation={data.relation} />
    </section>
  );
}
