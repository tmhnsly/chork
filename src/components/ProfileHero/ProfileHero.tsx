import { UserAvatar, Username } from "@/components/ui";
import { CountUpNumber } from "@/components/ui/CountUpNumber/CountUpNumber";
import { ProfileActions } from "./ProfileActions";
import { SettingsCorner } from "./SettingsCorner";
import type { FriendStanding } from "@/lib/data/friend-queries";
import styles from "./profileHero.module.scss";

/** One item of the career line — "6 sends", "3 flashes", "1 set". */
export interface CareerStat {
  /** Already agreeing with the number — the page runs `plural()`. */
  label: string;
  value: number;
  /**
   * Role colour, so the word means the same colour here as on the
   * Current Set card one card down: sends accent, flashes flash.
   */
  tone?: "accent" | "flash";
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
  career: CareerStat[];
  standing: FriendStanding;
}

/**
 * The identity: who this is, on the page, not in a box.
 *
 * Six passes treated this as a card — an accent wash, a black
 * cover, glass over the avatar, then a plain card matching its
 * neighbours. Matching was the last mistake: it made the climber
 * one of four identical rectangles, the settings-app shell CLAUDE.md
 * warns about. Every athlete profile puts the face on the page;
 * cards are for content, and a person is not content.
 *
 *   • The face is the moment. Avatar at winner size, centred, the
 *     name beneath in the display voice, handle · gym · streak as one
 *     quiet line. No ring, no wash: the page's own planes give it
 *     depth.
 *   • One career line, not a stat bar. The three numbers the cards
 *     below CAN'T show — with a gym: sends, flashes, sets climbed;
 *     without one: matches, wins, flashes. The old bar repeated the
 *     Current Set card (placing, points, flashes) one card up from
 *     it, which is what made the page feel padded. Number and word
 *     take the role colour so it reads like that card's stat row.
 *   • Settings is chrome: a round ghost gear in the corner, no border
 *     until hover. The bordered square read as a form control.
 */
export function ProfileHero({ user, meta, career, standing }: Props) {
  const named = user.name.trim().length > 0;
  const heading = named ? user.name.trim() : `@${user.username}`;
  // The handle only joins the meta line when the heading isn't
  // already it.
  const showHandle = named;

  return (
    <section className={styles.hero} aria-label={`@${user.username}`}>
      {standing.status === "self" && (
        <div className={styles.corner}>
          <SettingsCorner />
        </div>
      )}

      <UserAvatar user={user} size="podiumWin" priority />

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
        <p className={styles.career}>
          {career.map((stat) => (
            <span
              key={stat.label}
              className={[
                styles.careerItem,
                stat.tone === "accent" ? styles.toneAccent : "",
                stat.tone === "flash" ? styles.toneFlash : "",
              ].filter(Boolean).join(" ")}
            >
              <span className={styles.careerValue}>
                <CountUpNumber value={stat.value} />
              </span>{" "}
              {stat.label}
            </span>
          ))}
        </p>
      </div>

      {/* Nothing for your own profile — Friends is a nav tab. A
          visited profile keeps its Add / Accept / Friends control. */}
      <ProfileActions userId={user.id} username={user.username} standing={standing} />
    </section>
  );
}
