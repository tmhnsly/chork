import { PageHeader } from "@/components/motion";
import styles from "./adminHeader.module.scss";

interface Props {
  gymName: string;
  isOwner: boolean;
}

/**
 * Admin dashboard header — uses the shared `PageHeader` primitive so
 * the admin title sits at the same scale/spacing as every other page
 * title in the app. Owner badge sits inline on the subtitle.
 */
export function AdminHeader({ gymName, isOwner }: Props) {
  return (
    <PageHeader
      title="Admin"
      subtitle={
        <span className={styles.subline}>
          <span>{gymName}</span>
          {isOwner && <span className={styles.roleBadge}>Owner</span>}
        </span>
      }
    />
  );
}
