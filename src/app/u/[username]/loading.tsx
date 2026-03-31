import { Skeleton } from "@/components/ui";
import { BentoGrid, BentoCell } from "@/components/ui";
import styles from "./user.module.scss";

export default function ProfileLoading() {
  return (
    <main className={styles.page}>
      {/* Profile header skeleton */}
      <div className={styles.headerSkeleton}>
        <Skeleton variant="circle" width={96} height={96} />
        <div className={styles.headerSkeletonText}>
          <Skeleton variant="text" width={180} height={28} />
          <Skeleton variant="text" width={120} height={16} />
        </div>
      </div>

      {/* Current set stats skeleton */}
      <div className={styles.statsSkeleton}>
        <Skeleton variant="text" width={140} height={12} />
        <BentoGrid columns={3}>
          <BentoCell><Skeleton height={56} /></BentoCell>
          <BentoCell><Skeleton height={56} /></BentoCell>
          <BentoCell><Skeleton height={56} /></BentoCell>
        </BentoGrid>
      </div>

      {/* All time skeleton */}
      <div className={styles.statsSkeleton}>
        <Skeleton variant="text" width={80} height={12} />
        <BentoGrid columns={2}>
          <BentoCell><Skeleton height={56} /></BentoCell>
          <BentoCell><Skeleton height={56} /></BentoCell>
        </BentoGrid>
      </div>

      {/* Activity skeleton */}
      <div className={styles.activitySkeleton}>
        <Skeleton variant="text" width={120} height={12} />
        <Skeleton height={44} />
        <Skeleton height={44} />
        <Skeleton height={44} />
      </div>
    </main>
  );
}
