import { FaStar, FaBolt, FaCheck, FaArrowTrendUp } from "react-icons/fa6";
import { shimmerStyles, BentoGrid, BentoStat } from "@/components/ui";
import { PunchTile } from "@/components/PunchTile/PunchTile";
import styles from "./user.module.scss";
import headerStyles from "@/components/ProfileHeader/profileHeader.module.scss";
import statsStyles from "@/components/ClimberStats/climberStats.module.scss";

export default function ProfileLoading() {
  return (
    <main className={styles.page}>
      <header className={headerStyles.header}>
        <div className={`${styles.avatarPlaceholder} ${shimmerStyles.skeleton}`} />
        <div className={headerStyles.identity}>
          <h1 className={`${headerStyles.username} ${styles.namePlaceholder} ${shimmerStyles.skeleton}`}>
            @username
          </h1>
          <p className={`${headerStyles.displayName} ${styles.namePlaceholder} ${shimmerStyles.skeleton}`}>
            Display Name
          </p>
          <div className={styles.editPlaceholder} />
        </div>
      </header>

      <div className={statsStyles.wrapper}>
        <section className={statsStyles.section}>
          <span className={statsStyles.sectionLabel}>Current set</span>
          <div className={styles.miniGrid}>
            {Array.from({ length: 14 }, (_, i) => (
              <PunchTile key={i} number={i + 1} state="empty" className={shimmerStyles.skeleton} />
            ))}
          </div>
          <BentoGrid columns={3}>
            <BentoStat label="Points" icon={<FaStar />} className={shimmerStyles.skeleton} />
            <BentoStat label="Sends" icon={<FaCheck />} className={shimmerStyles.skeleton} />
            <BentoStat label="Flashes" icon={<FaBolt />} className={shimmerStyles.skeleton} />
          </BentoGrid>
        </section>

        <section className={statsStyles.section}>
          <span className={statsStyles.sectionLabel}>All time</span>
          <BentoGrid columns={3}>
            <BentoStat label="Points" icon={<FaStar />} className={shimmerStyles.skeleton} />
            <BentoStat label="Sends" icon={<FaArrowTrendUp />} className={shimmerStyles.skeleton} />
            <BentoStat label="Flashes" icon={<FaBolt />} className={shimmerStyles.skeleton} />
          </BentoGrid>
        </section>
      </div>
    </main>
  );
}
