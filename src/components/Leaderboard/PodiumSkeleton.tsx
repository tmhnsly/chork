import { shimmerStyles } from "@/components/ui";
import { AVATAR_SIZES } from "@/components/ui/avatar-sizes";
import styles from "./podium.module.scss";

/**
 * `Podium`, waiting: three slots on the podium's own grid — a disc
 * where the face goes, a bar for the handle, the plinth at its
 * tier's height — from the podium's own stylesheet, so it measures
 * what the real podium measures and the plinths are already standing
 * where they will stand.
 */
export function PodiumSkeleton() {
  const slots: { place: 1 | 2 | 3; size: keyof typeof AVATAR_SIZES }[] = [
    { place: 2, size: "podium" },
    { place: 1, size: "podiumWin" },
    { place: 3, size: "podium" },
  ];
  return (
    <ul className={styles.podium} aria-hidden>
      {slots.map(({ place, size }) => (
        <li key={place}>
          <div className={`${styles.slot} ${styles[`place${place}`]}`}>
            <span
              className={shimmerStyles.skeletonDisc}
              style={{ "--skeleton-size": `var(--size-avatar-${size})` } as React.CSSProperties}
            />
            <span className={shimmerStyles.skeletonLine} style={{ "--skeleton-w": "5rem" } as React.CSSProperties} />
            <span className={shimmerStyles.skeletonLine} style={{ "--skeleton-w": "3rem" } as React.CSSProperties} />
            <div className={styles.plinth}>
              <span className={styles.placeLabel}>{place}</span>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
