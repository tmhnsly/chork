import { shimmerStyles } from "@/components/ui";
import styles from "./user.module.scss";
import headerStyles from "@/components/ProfileHeader/profileHeader.module.scss";
import statsStyles from "@/components/ClimberStats/climberStats.module.scss";

export default function ProfileLoading() {
  return (
    <main className={styles.page}>
      {/* Header skeleton — horizontal: identity left, avatar right */}
      <header className={headerStyles.header}>
        <div className={headerStyles.identity}>
          <div className={`${shimmerStyles.skeletonLine} ${shimmerStyles.skeletonShort}`} style={{ height: "1.5rem" }} />
          <div className={`${shimmerStyles.skeletonLine} ${shimmerStyles.skeletonShort}`} style={{ height: "1rem" }} />
        </div>
        <div className={headerStyles.rightGroup}>
          <div
            className={`${shimmerStyles.skeleton}`}
            style={{ width: "var(--space-16)", height: "var(--space-16)", borderRadius: "var(--radius-full)" }}
          />
        </div>
      </header>

      {/* Stats skeleton */}
      <div className={statsStyles.wrapper}>
        <div className={`${statsStyles.statsCard} ${shimmerStyles.skeleton}`} style={{ height: "5rem" }} />
      </div>

      {/* Section placeholders */}
      <div className={`${shimmerStyles.skeleton}`} style={{ height: "6rem", borderRadius: "var(--radius-2)" }} />
      <div className={`${shimmerStyles.skeleton}`} style={{ height: "4rem", borderRadius: "var(--radius-2)" }} />
    </main>
  );
}
