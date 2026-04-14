import Link from "next/link";
import { WidgetCard } from "./WidgetCard";
import { UserAvatar } from "@/components/ui";
import { FaBolt } from "react-icons/fa6";
import type { FlashLeader } from "@/lib/data/dashboard-queries";
import styles from "./flashLeaderboardWidget.module.scss";

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
              aria-label={`@${row.username}, ${row.flash_count} flashes. Open profile.`}
            >
              <span className={styles.rank}>{i + 1}</span>
              <UserAvatar
                user={{
                  id: row.user_id,
                  username: row.username,
                  name: "",
                  avatar_url: row.avatar_url,
                }}
                size={32}
              />
              <span className={styles.handle}>@{row.username}</span>
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
