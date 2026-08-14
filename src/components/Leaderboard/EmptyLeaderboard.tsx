import { FaTrophy } from "react-icons/fa6";
import { LinkButton } from "@/components/ui";
import styles from "./emptyLeaderboard.module.scss";

export function EmptyLeaderboard() {
  return (
    <div className={styles.empty}>
      <FaTrophy className={styles.icon} aria-hidden="true" />
      <h2 className={styles.heading}>Be the first to send</h2>
      <p className={styles.body}>
        No climbs logged yet — log your first send to get on the board.
      </p>
      <LinkButton href="/">Log a climb</LinkButton>
    </div>
  );
}
