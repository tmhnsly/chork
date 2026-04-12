import { RevealText } from "@/components/motion";
import styles from "./adminHeader.module.scss";

interface Props {
  gymName: string;
  isOwner: boolean;
}

/**
 * Admin dashboard header — matches the climber-facing header pattern
 * used on the wall and Chorkboard pages (title + secondary gym text
 * below). Owner badge surfaces the role explicitly so it's clear who
 * can manage other admins / billing later on.
 */
export function AdminHeader({ gymName, isOwner }: Props) {
  return (
    <header className={styles.header}>
      <RevealText text="Admin" as="h1" className={styles.title} />
      <div className={styles.subline}>
        <span className={styles.gym}>{gymName}</span>
        {isOwner && <span className={styles.roleBadge}>Owner</span>}
      </div>
    </header>
  );
}
