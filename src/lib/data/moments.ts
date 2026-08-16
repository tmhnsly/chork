import { ACHIEVEMENTS } from "@/config/achievements";
import { formatGrade, type GradingScale } from "./grade-label";

/**
 * A friend's moment, and the sentence it becomes.
 *
 * Four kinds, all DERIVED at read time by `get_friend_moments` —
 * nothing is stored. See migration 109 for why.
 *
 * The date is a `date`, not a timestamp, and that is enforced in SQL
 * rather than here: the coarse-timestamp rule exists so nobody can
 * infer when a friend is physically at the gym, and a rule the
 * renderer owns is a rule one careless component can break.
 */

export type MomentKind =
  | "personal_best"
  | "match_won"
  | "achievement"
  | "competition_placing";

export interface Moment {
  kind: MomentKind;
  user_id: string;
  username: string | null;
  name: string | null;
  avatar_url: string | null;
  /** `YYYY-MM-DD`. Never carries a clock time — see above. */
  occurred_on: string;
  detail: Record<string, unknown>;
}

/** Icon key, mapped to a glyph by the component. */
export type MomentIcon = "grade" | "crown" | "badge" | "podium";

export interface MomentCopy {
  icon: MomentIcon;
  /** The sentence, without the climber's handle — the row adds that. */
  text: string;
  /** Where tapping the row goes, or null if it isn't a link. */
  href: string | null;
}

const ORDINALS = ["", "1st", "2nd", "3rd"] as const;

function str(detail: Record<string, unknown>, key: string): string | null {
  const value = detail[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function num(detail: Record<string, unknown>, key: string): number | null {
  const value = detail[key];
  return typeof value === "number" ? value : null;
}

/**
 * One moment → the words for it.
 *
 * Returns null for a kind this build doesn't understand rather than
 * throwing: the feed is derived from live rows, so a row can outlive
 * the client that renders it, and one unknown kind must not blank the
 * whole feed.
 */
export function momentCopy(moment: Moment): MomentCopy | null {
  const d = moment.detail ?? {};

  switch (moment.kind) {
    case "personal_best": {
      const grade = num(d, "grade");
      const scale = str(d, "grading_scale");
      if (grade === null || !scale) return null;
      // `points` scales never produce this kind — the SQL excludes
      // them, since there's no grade to be best at.
      const label = formatGrade(grade, scale as GradingScale);
      // One sentence covers both `first_ever` and beating a previous
      // best, because it is literally true either way — "their first
      // 6a+" is their first 6a+ whether or not they had climbed the
      // scale before. The flag stays in the payload for anyone who
      // later wants to say something different about the two.
      return {
        icon: "grade",
        text: `sent their first ${label}`,
        href: moment.username ? `/u/${moment.username}` : null,
      };
    }

    case "match_won": {
      const name = str(d, "match_name");
      const players = num(d, "player_count");
      const where = name ? ` at ${name}` : "";
      const against =
        players && players > 1 ? ` against ${players - 1} others` : "";
      return {
        icon: "crown",
        text: `won a match${where}${against}`,
        href: null,
      };
    }

    case "achievement": {
      const id = str(d, "badge_id");
      const badge = ACHIEVEMENTS.find((b) => b.id === id);
      if (!badge) return null;
      return {
        icon: "badge",
        text: `earned ${badge.name}`,
        href: moment.username ? `/u/${moment.username}` : null,
      };
    }

    case "competition_placing": {
      const rank = num(d, "rank");
      const comp = str(d, "competition_name");
      const gym = str(d, "gym_name");
      if (rank === null || rank < 1 || rank > 3) return null;
      const where = gym ? ` at ${gym}` : "";
      return {
        icon: "podium",
        text: `finished ${ORDINALS[rank]} in ${comp ?? "a competition"}${where}`,
        href: null,
      };
    }

    default:
      return null;
  }
}
