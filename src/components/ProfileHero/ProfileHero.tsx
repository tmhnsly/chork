import Link from "next/link";
import { UserAvatar, Username } from "@/components/ui";
import { CountUpNumber } from "@/components/ui/CountUpNumber/CountUpNumber";
import { ProfileActions } from "./ProfileActions";
import { SettingsCorner } from "./SettingsCorner";
import type { FriendStanding } from "@/lib/data/friend-queries";
import styles from "./profileHero.module.scss";

/** One cell of the stat bar. */
export interface HeroStat {
  label: string;
  /** null renders an em dash — unranked, or nothing played yet. */
  value: number | null;
  /** Sits before the number, unanimated. "#" for a placing. */
  prefix?: string;
  tone?: "accent" | "flash";
  /** Makes the cell a link — the rank cell goes to Ranks. */
  href?: string;
}

interface Props {
  user: {
    id: string;
    username: string;
    name: string;
    avatar_url: string;
  };
  /** Quiet context after the handle: the gym, a streak. */
  meta: string[];
  /** Exactly three, chosen by the page — see the note below. */
  stats: HeroStat[];
  standing: FriendStanding;
}

const EM_DASH = "—";

/**
 * The identity card: who this is, and the three numbers that say how
 * they're doing.
 *
 * Shaped like an athlete header rather than a poster, after five
 * passes that treated it as a canvas:
 *
 *   • The NAME leads, in the card-title voice. The handle is quiet
 *     context beneath it with the gym and any streak. It was the
 *     other way round — "@tom" in the black display face, the page
 *     title's voice, with the real name whispering underneath — which
 *     put a punctuation mark in the loudest position on the screen and
 *     inverted what every social profile does. When a climber hasn't
 *     set a name the handle takes the heading, so the line is never
 *     the same word twice.
 *   • The stat bar is THREE cells the page fills, because the numbers
 *     worth showing depend on where a climber climbs. With a gym:
 *     placing, points, flashes. Without one: matches, wins, podiums —
 *     a gymless climber used to be shown 0 / 0 / 0, which is worse
 *     than showing nothing, since none of those numbers could ever
 *     move for them.
 *   • Placing is a cell, not a chip. It is a number like the others;
 *     it was only ever a chip because it arrived late.
 *   • The card is `surface.card` with SectionCard's rhythm, so the
 *     column reads as one family.
 */
export function ProfileHero({ user, meta, stats, standing }: Props) {
  const named = user.name.trim().length > 0;
  const heading = named ? user.name.trim() : `@${user.username}`;
  // The handle only joins the meta line when the heading isn't
  // already it.
  const showHandle = named;

  return (
    <section className={styles.card} aria-label={`@${user.username}`}>
      <div className={styles.identity}>
        <UserAvatar user={user} size="hero" priority />
        <div className={styles.names}>
          <h1 className={styles.name}>{heading}</h1>
          {(showHandle || meta.length > 0) && (
            <p className={styles.meta}>
              {showHandle && <Username username={user.username} />}
              {meta.map((item) => (
                <span key={item} className={styles.metaItem}>
                  {item}
                </span>
              ))}
            </p>
          )}
        </div>
        {standing.status === "self" && (
          <div className={styles.corner}>
            <SettingsCorner />
          </div>
        )}
      </div>

      <div className={styles.stats}>
        {stats.map((stat) => {
          const body = (
            <>
              <span className={styles.statLabel}>{stat.label}</span>
              <span className={styles.statValue}>
                {stat.value === null ? (
                  EM_DASH
                ) : (
                  <>
                    {stat.prefix}
                    <CountUpNumber value={stat.value} />
                  </>
                )}
              </span>
            </>
          );
          const cls = [
            styles.stat,
            stat.tone === "accent" ? styles.statAccent : "",
            stat.tone === "flash" ? styles.statFlash : "",
          ].filter(Boolean).join(" ");
          return stat.href ? (
            <Link key={stat.label} href={stat.href} className={cls}>
              {body}
            </Link>
          ) : (
            <div key={stat.label} className={cls}>
              {body}
            </div>
          );
        })}
      </div>

      {/* Nothing for your own profile — Friends is a nav tab. A
          visited profile keeps its Add / Accept / Friends control. */}
      <ProfileActions
        userId={user.id}
        username={user.username}
        standing={standing}
      />
    </section>
  );
}
