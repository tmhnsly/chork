import styles from "./setStatusBadge.module.scss";

interface Props {
  status: "draft" | "live" | "archived";
}

const LABELS: Record<Props["status"], string> = {
  draft:    "Draft",
  live:     "Live",
  archived: "Archived",
};

export function SetStatusBadge({ status }: Props) {
  return <span className={`${styles.badge} ${styles[status]}`}>{LABELS[status]}</span>;
}
