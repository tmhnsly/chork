import { Skeleton } from "@/components/ui";
import { BentoGrid, BentoCell } from "@/components/ui";
import styles from "./page.module.scss";

export default function HomeLoading() {
  return (
    <main className={styles.app}>
      <div className={styles.loadingSkeleton}>
        {/* Title */}
        <Skeleton width={220} height={36} />

        {/* Punch tile grid — 4x3 grid of squares */}
        <div className={styles.tileGridSkeleton}>
          {Array.from({ length: 12 }, (_, i) => (
            <Skeleton key={i} variant="square" />
          ))}
        </div>

        {/* Legend */}
        <div className={styles.legendSkeleton}>
          <Skeleton width={80} height={12} />
          <Skeleton width={60} height={12} />
          <Skeleton width={70} height={12} />
        </div>

        {/* Stat widgets */}
        <BentoGrid columns={2}>
          <BentoCell><Skeleton height={56} /></BentoCell>
          <BentoCell><Skeleton height={56} /></BentoCell>
          <BentoCell><Skeleton height={56} /></BentoCell>
          <BentoCell><Skeleton height={56} /></BentoCell>
        </BentoGrid>
      </div>
    </main>
  );
}
