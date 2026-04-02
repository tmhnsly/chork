import { FaStar, FaBolt, FaCheck, FaArrowTrendUp } from "react-icons/fa6";
import { Shimmer, BentoGrid, BentoStat } from "@/components/ui";
import styles from "./user.module.scss";
import headerStyles from "@/components/ProfileHeader/profileHeader.module.scss";
import statsStyles from "@/components/ClimberStats/climberStats.module.scss";

export default function ProfileLoading() {
  return (
    <Shimmer>
      <main className={styles.page}>
        {/* ProfileHeader shape */}
        <header className={headerStyles.header}>
          <div className={styles.avatarPlaceholder} />
          <div className={headerStyles.identity}>
            <h1 className={headerStyles.name}>Display Name</h1>
            <p className={headerStyles.username}>@username</p>
          </div>
        </header>

        {/* ClimberStats shape */}
        <div className={statsStyles.wrapper}>
          <section className={statsStyles.section}>
            <span className={statsStyles.sectionLabel}>APR 7 – MAY 4</span>
            <BentoGrid columns={3}>
              <BentoStat label="Points" value={0} icon={<FaStar />} variant="accent" />
              <BentoStat label="Sends" value={0} icon={<FaCheck />} />
              <BentoStat label="Flashes" value={0} icon={<FaBolt />} variant="flash" />
            </BentoGrid>
          </section>

          <section className={statsStyles.section}>
            <span className={statsStyles.sectionLabel}>All time</span>
            <BentoGrid columns={2}>
              <BentoStat label="Sends" value={0} icon={<FaArrowTrendUp />} />
              <BentoStat label="Flashes" value={0} icon={<FaBolt />} variant="flash" />
            </BentoGrid>
          </section>
        </div>
      </main>
    </Shimmer>
  );
}
