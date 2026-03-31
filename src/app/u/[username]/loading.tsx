import { FaStar, FaBolt, FaCheck, FaArrowTrendUp } from "react-icons/fa6";
import { Shimmer, BentoGrid, BentoStat } from "@/components/ui";
import styles from "./user.module.scss";

export default function ProfileLoading() {
  return (
    <main className={styles.page}>
      <Shimmer>
        <div className={styles.headerSkeleton}>
          <div className={styles.avatarPlaceholder} />
          <div className={styles.headerSkeletonText}>
            <span className={styles.namePlaceholder}>Display Name</span>
            <span className={styles.usernamePlaceholder}>@username</span>
          </div>
        </div>
      </Shimmer>

      <div className={styles.statsSkeleton}>
        <Shimmer><span className={styles.labelPlaceholder}>APR 7 - MAY 4</span></Shimmer>
        <Shimmer>
          <BentoGrid columns={3}>
            <BentoStat label="Points" value={0} icon={<FaStar />} variant="accent" />
            <BentoStat label="Sends" value={0} icon={<FaCheck />} />
            <BentoStat label="Flashes" value={0} icon={<FaBolt />} variant="flash" />
          </BentoGrid>
        </Shimmer>
      </div>

      <div className={styles.statsSkeleton}>
        <Shimmer><span className={styles.labelPlaceholder}>All time</span></Shimmer>
        <Shimmer>
          <BentoGrid columns={2}>
            <BentoStat label="Sends" value={0} icon={<FaArrowTrendUp />} />
            <BentoStat label="Flashes" value={0} icon={<FaBolt />} variant="flash" />
          </BentoGrid>
        </Shimmer>
      </div>
    </main>
  );
}
