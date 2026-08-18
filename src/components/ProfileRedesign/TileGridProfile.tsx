import { UserAvatar } from "@/components/ui";
import { CountUpNumber } from "@/components/ui/CountUpNumber/CountUpNumber";
import { ProfileActions } from "./ProfileActions";
import type { ProfileMockData } from "./types";
import styles from "./tileGridProfile.module.scss";

/**
 * Variant B — the all-time block rebuilt in the card's vocabulary.
 *
 * Layout stays where it is: header on top, stats below. What changes
 * is that the six identical grey rectangles become tiles that differ
 * by weight and by colour, the way a route tile does — lime for
 * points, amber for flashes, teal for zones. Three primaries carry the
 * headline; the derived ratios sit under them at half the size, which
 * is the ranking the grey grid refused to make.
 *
 * The conservative option of the two: nothing moves, so nothing that
 * currently works has to be re-learned. CLAUDE.md's tile language
 * applied to the one surface that never got it.
 */
export function TileGridProfile({ data }: { data: ProfileMockData }) {
  return (
    <div className={styles.wrap}>
      <header className={styles.header}>
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
      </header>

      <ProfileActions relation={data.relation} />

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>All time</h2>

        <div className={styles.primaryRow}>
          <div className={`${styles.tile} ${styles.tileAccent}`}>
            <span className={styles.big}><CountUpNumber value={data.points} /></span>
            <span className={styles.tileLabel}>Points</span>
          </div>
          <div className={styles.tile}>
            <span className={styles.big}><CountUpNumber value={data.sends} /></span>
            <span className={styles.tileLabel}>Sends</span>
          </div>
          <div className={`${styles.tile} ${styles.tileFlash}`}>
            <span className={styles.big}><CountUpNumber value={data.flashes} /></span>
            <span className={styles.tileLabel}>Flashes</span>
          </div>
        </div>

        {/* Derived from the three above, so half the size. Six equal
            boxes made a climber work out which of these was the
            headline; none of them is. */}
        <div className={styles.secondaryRow}>
          <div className={styles.smallTile}>
            <span className={styles.small}>{Math.round(data.flashRate * 100)}%</span>
            <span className={styles.tileLabel}>Flash rate</span>
          </div>
          <div className={styles.smallTile}>
            <span className={styles.small}>{data.pointsPerSend.toFixed(1)}</span>
            <span className={styles.tileLabel}>Pts / send</span>
          </div>
          <div className={styles.smallTile}>
            <span className={styles.small}>{Math.round(data.completionRate * 100)}%</span>
            <span className={styles.tileLabel}>Completion</span>
          </div>
          <div className={styles.smallTile}>
            <span className={styles.small}>{data.streakCurrent}</span>
            <span className={styles.tileLabel}>Streak</span>
          </div>
        </div>
      </section>
    </div>
  );
}
