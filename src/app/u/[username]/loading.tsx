import { FaStar, FaBolt, FaCheck, FaArrowTrendUp } from "react-icons/fa6";
import { Shimmer, BentoGrid, BentoStat } from "@/components/ui";
import { PunchTile } from "@/components/PunchTile/PunchTile";
import styles from "./user.module.scss";
import headerStyles from "@/components/ProfileHeader/profileHeader.module.scss";
import statsStyles from "@/components/ClimberStats/climberStats.module.scss";

export default function ProfileLoading() {
  return (
    <main className={styles.page}>
      {/* ProfileHeader */}
      <header className={headerStyles.header}>
        <Shimmer><div className={styles.avatarPlaceholder} /></Shimmer>
        <div className={headerStyles.identity}>
          <Shimmer><h1 className={headerStyles.name}>Display Name</h1></Shimmer>
          <Shimmer><p className={headerStyles.username}>@username</p></Shimmer>
        </div>
      </header>

      {/* Current set: mini grid then stats */}
      <div className={statsStyles.wrapper}>
        <section className={statsStyles.section}>
          <Shimmer><span className={statsStyles.sectionLabel}>Current set</span></Shimmer>
          <div className={styles.miniGrid}>
            {Array.from({ length: 12 }, (_, i) => (
              <Shimmer key={i}>
                <PunchTile number={i + 1} state="empty" />
              </Shimmer>
            ))}
          </div>
          <BentoGrid columns={3}>
            <Shimmer><BentoStat label="Points" value={0} icon={<FaStar />} variant="accent" /></Shimmer>
            <Shimmer><BentoStat label="Sends" value={0} icon={<FaCheck />} /></Shimmer>
            <Shimmer><BentoStat label="Flashes" value={0} icon={<FaBolt />} variant="flash" /></Shimmer>
          </BentoGrid>
        </section>

        {/* All time */}
        <section className={statsStyles.section}>
          <Shimmer><span className={statsStyles.sectionLabel}>All time</span></Shimmer>
          <BentoGrid columns={3}>
            <Shimmer><BentoStat label="Points" value={0} icon={<FaStar />} variant="accent" /></Shimmer>
            <Shimmer><BentoStat label="Sends" value={0} icon={<FaArrowTrendUp />} /></Shimmer>
            <Shimmer><BentoStat label="Flashes" value={0} icon={<FaBolt />} variant="flash" /></Shimmer>
          </BentoGrid>
        </section>
      </div>
    </main>
  );
}
