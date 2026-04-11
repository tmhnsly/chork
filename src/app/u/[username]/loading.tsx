import { shimmerStyles } from "@/components/ui";
import styles from "./loading.module.scss";

export default function ProfileLoading() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerText}>
          <div className={`${styles.lineTall} ${shimmerStyles.skeleton}`} />
          <div className={`${styles.lineShort} ${shimmerStyles.skeleton}`} />
        </div>
        <div className={`${styles.avatar} ${shimmerStyles.skeleton}`} />
      </header>

      <div className={`${styles.statsBlock} ${shimmerStyles.skeleton}`} />
      <div className={`${styles.sectionBlock} ${shimmerStyles.skeleton}`} />
      <div className={`${styles.sectionBlockSmall} ${shimmerStyles.skeleton}`} />
    </main>
  );
}
