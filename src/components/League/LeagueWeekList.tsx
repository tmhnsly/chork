"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import { FaCrown, FaXmark } from "react-icons/fa6";
import type { LeagueWeek } from "@/lib/data/league-types";
import { removeMatchFromLeagueAction } from "@/app/match/league-actions";
import { showToast } from "@/components/ui";
import { countOf } from "@/lib/plural";
import styles from "./leagueWeekList.module.scss";

interface Props {
  leagueId: string;
  /** Newest first, as `get_league` returns them. */
  weeks: LeagueWeek[];
  /** The host can take a week out while the League is running. */
  canRemove: boolean;
}

/**
 * "Week n" counts from the oldest, because that is how the group
 * talks about it — but the list shows the newest at the top, so the
 * number is derived from position among the ARCHIVED weeks only. A
 * live Match is not a week yet; it is this week, in progress.
 */
export function weekLabel(week: LeagueWeek, index: number, archivedTotal: number): string {
  if (week.status === "live") return "This week — in progress";
  return `Week ${archivedTotal - index}`;
}

export function LeagueWeekList({ leagueId, weeks, canRemove }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const archived = weeks.filter((w) => w.status === "archived");

  function remove(setId: string) {
    startTransition(async () => {
      const result = await removeMatchFromLeagueAction(leagueId, setId);
      if ("error" in result) {
        showToast(result.error, "error");
        return;
      }
      router.refresh();
    });
  }

  return (
    <ol className={styles.list}>
      {weeks.map((week) => {
        // Position among archived weeks, ignoring any live one above
        // it. Found by reference rather than a running counter —
        // `archived` is a filtered view of the same week objects, so
        // `indexOf` gives the oldest-first position without
        // reassigning a variable across render.
        const archivedIndex = week.status === "archived" ? archived.indexOf(week) : -1;
        const label = weekLabel(week, archivedIndex, archived.length);
        const href = week.status === "live" ? `/match/${week.set_id}` : `/match/summary/${week.set_id}`;
        return (
          <li key={week.set_id} className={styles.row}>
            <Link href={href} className={styles.body}>
              <span className={styles.label}>{label}</span>
              <span className={styles.meta}>
                {[
                  week.name?.trim() || null,
                  format(parseISO(week.ends_at ?? week.starts_at), "d MMM"),
                  countOf(week.player_count, "player"),
                  week.game_mode === "chork" ? "Chork" : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </Link>
            {week.winner_user_id && <FaCrown aria-hidden className={styles.crown} />}
            {canRemove && week.status === "archived" && (
              <button
                type="button"
                className={styles.remove}
                aria-label={`Remove ${label} from the league`}
                disabled={pending}
                onClick={() => remove(week.set_id)}
              >
                <FaXmark aria-hidden />
              </button>
            )}
          </li>
        );
      })}
    </ol>
  );
}
