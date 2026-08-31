import Link from "next/link";
import { FaFire, FaLocationDot, FaRankingStar } from "react-icons/fa6";
import { UserAvatar } from "@/components/ui";
import { CountUpNumber } from "@/components/ui/CountUpNumber/CountUpNumber";
import { RevealText } from "@/components/motion";
import { ProfileActions } from "./ProfileActions";
import { SettingsCorner } from "./SettingsCorner";
import { ProfileFriendsStat } from "./ProfileFriendsStat";
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
  /** Own profile only — the roster behind the Friends stat.
   *  `get_friends` is caller-scoped, so a visitor never gets one. */
  friends?: Friend[];
}

/**
 * The identity card: who this is, how they're standing, and their
 * totals — in the SAME card shell as every section below it.
 *
 * Four passes tried to make this card special (an accent wash, a
 * near-black cover, a derived dark cover, glass over a blurred
 * avatar). Each invented a colour the design system doesn't have —
 * the blurred avatar's was skin tone — and each looked like a
 * different app from the cards underneath it. This one matches:
 *
 *   • `surface.card`, the radius and the padding every SectionCard
 *     uses, so the column reads as one family.
 *   • The totals wear the Current-set card's exact treatment —
 *     role-coloured uppercase label, italic number beneath — and the
 *     same role colours, so SENDS is the same green in both places.
 *   • One chip shape. Rank is the single accent mark, because
 *     placement is the number the app ranks on and accent means
 *     "this is yours"; it is also the only control here, tapping
 *     through to Ranks. The hairline above the totals is a BORDER
 *     token, never the accent doing decoration.
 *   • Friends is a STAT, not a call to action — the number sits with
 *     the others and the roster opens in a drawer. The full-width
 *     "Find friends" button it replaced was chrome given the weight
 *     of an achievement.
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
        <UserAvatar user={user} size="hero" priority />
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

      {/* Sends, flashes, points — the same words, colours and plain
          uppercase labels as the Current-set card below — plus the
          people you climb with, which is a number, not a call to
          action. */}
      <div className={styles.totals}>
        <div className={styles.total}>
          <span className={`${styles.totalLabel} ${styles.labelAccent}`}>Sends</span>
          <span className={`${styles.totalValue} ${styles.valueAccent}`}>
            <CountUpNumber value={totals.sends} />
          </span>
        </div>
        <div className={styles.total}>
          <span className={`${styles.totalLabel} ${styles.labelFlash}`}>Flashes</span>
          <span className={`${styles.totalValue} ${styles.valueFlash}`}>
            <CountUpNumber value={totals.flashes} />
          </span>
        </div>
        <div className={styles.total}>
          <span className={styles.totalLabel}>Points</span>
          <span className={styles.totalValue}>
            <CountUpNumber value={totals.points} />
          </span>
        </div>
        {friends && <ProfileFriendsStat friends={friends} />}
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
