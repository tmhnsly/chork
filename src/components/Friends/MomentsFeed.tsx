import Link from "next/link";
import { FaArrowTrendUp, FaCrown, FaAward, FaMedal } from "react-icons/fa6";
import { UserAvatar, Username } from "@/components/ui";
import { momentCopy, type Moment, type MomentIcon } from "@/lib/data/moments";
import { relativeDay } from "@/lib/data/activity-time";
import styles from "./momentsFeed.module.scss";

const ICONS: Record<MomentIcon, typeof FaCrown> = {
  grade: FaArrowTrendUp,
  crown: FaCrown,
  badge: FaAward,
  podium: FaMedal,
};

interface Props {
  moments: Moment[];
}

/**
 * Friends' recent moments.
 *
 * This exists because the friends board is set-scoped: two friends at
 * different gyms share no Set, so the board is empty for them and
 * nothing else in the app shows one to the other.
 *
 * Sparse on purpose. A personal best, a match won, a badge, a podium
 * — four things worth telling someone about, rather than every send.
 * If this ever scrolls, the rule for what counts as a moment is wrong.
 */
export function MomentsFeed({ moments }: Props) {
  const rendered = moments
    .map((m) => ({ moment: m, copy: momentCopy(m) }))
    // A kind this build doesn't know about drops out rather than
    // blanking the feed — moments are derived, so a row can outlive
    // the client rendering it.
    .filter((r): r is { moment: Moment; copy: NonNullable<typeof r.copy> } =>
      r.copy !== null,
    );

  if (rendered.length === 0) return null;

  return (
    <section className={styles.section} aria-labelledby="friends-moments">
      <h2 id="friends-moments" className={styles.heading}>
        Lately
      </h2>
      <ul className={styles.list}>
        {rendered.map(({ moment, copy }, i) => {
          const Icon = ICONS[copy.icon];
          const username = moment.username ?? "unknown";
          const body = (
            <>
              <UserAvatar
                user={{
                  id: moment.user_id,
                  username,
                  name: moment.name ?? "",
                  avatar_url: moment.avatar_url ?? "",
                }}
                size="row"
              />
              <span className={styles.text}>
                <span className={styles.line}>
                  <Username username={username} />
                  {` ${copy.text}`}
                </span>
                {/* Coarse by contract — "today" / "3 days ago", never
                    a clock time, so nobody can infer when a friend is
                    physically at the gym. The RPC returns a date, so
                    there is nothing finer to leak. */}
                <span className={styles.when}>
                  {relativeDay(moment.occurred_on)}
                </span>
              </span>
              <Icon className={styles.icon} aria-hidden />
            </>
          );

          return (
            <li key={`${moment.kind}-${moment.user_id}-${moment.occurred_on}-${i}`}>
              {copy.href ? (
                <Link href={copy.href} className={styles.row}>
                  {body}
                </Link>
              ) : (
                <div className={styles.row}>{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
