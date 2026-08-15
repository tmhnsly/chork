import Link from "next/link";
import { WidgetCard } from "./WidgetCard";
import { UserAvatar, Username } from "@/components/ui";
import { FaBolt } from "react-icons/fa6";
import type { FlashLeader } from "@/lib/data/dashboard-queries";
import styles from "./flashLeaderboardWidget.module.scss";
import { countOf } from "@/lib/plural";

interface Props {
  leaders: FlashLeader[];
}

export function FlashLeaderboardWidget({ leaders }: Props) {
  return (
    <WidgetCard
      title="Flash leaderboard"
      subtitle="Top climbers by flashes this set"
      empty={leaders.length === 0}
      emptyMessage="No flashes yet."
    >
      <ol className={styles.list}>
        {leaders.map((row, i) => (
          <li key={row.user_id}>
            <Link
              href={`/u/${row.username}`}
              className={styles.row}
              aria-label={`@${row.username}, ${countOf(row.flash_count, "flash", "flashes")}. Open profile.`}
            >
              <span className={styles.rank}>{i + 1}</span>
              <UserAvatar
                user={{
                  id: row.user_id,
                  username: row.username,
                  name: "",
                  avatar_url: row.avatar_url,
                }}
                size="row"
              />
              <Username username={row.username} className={styles.handle} />
              <span className={styles.count}>
                <FaBolt aria-hidden /> {row.flash_count}
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </WidgetCard>
  );
}
