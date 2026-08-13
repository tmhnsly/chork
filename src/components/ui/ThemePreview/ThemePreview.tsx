"use client";

import { ActivityRings } from "@/components/ui/ActivityRings/ActivityRings";
import { RING_SIZES } from "@/components/ui/ActivityRings/ring-sizes";
import type { ThemeName } from "@/lib/theme-store";
import styles from "./themePreview.module.scss";

interface Props {
  theme: ThemeName;
  className?: string;
}

/**
 * A miniature of the current-set card, rendered in one palette.
 *
 * Scoped with `data-theme`, so it paints in `theme` regardless of
 * which palette the app is using — every theme, including the
 * default, is declared as a `[data-theme]` block for exactly this.
 * Nothing here reads the active theme or mutates anything.
 *
 * It's built from the real thing: the same `<ActivityRings>` the wall
 * uses, the same semantic tokens, the same tile states. An earlier
 * version drew abstract bars and squares, which was cheaper to build
 * and useless to look at — it told you a palette was "pink-ish"
 * without showing what pink-ish does to a card, a number, a label or
 * a grid. If a palette ever makes a send hard to tell from a flash,
 * that now shows up here, in the picker, before anyone applies it.
 *
 * The numbers are fixed and meaningless on purpose: this illustrates
 * colour, and live stats would invite reading it as real data.
 *
 * `aria-hidden` — decoration. The option's own label and pressed
 * state carry the meaning; narrating a fake stat card would be noise.
 */
export function ThemePreview({ theme, className }: Props) {
  return (
    <span
      className={[styles.root, className].filter(Boolean).join(" ")}
      data-theme={theme}
      aria-hidden="true"
    >
      <span className={styles.card}>
        <span className={styles.top}>
          <ActivityRings
            // Same three rings as RingStatsRow, in the same order:
            // sends (accent), flashes (flash), zones (success).
            rings={[
              { value: 0.62, color: "var(--accent-solid)" },
              { value: 0.4, color: "var(--flash-solid)" },
              { value: 0.25, color: "var(--success-solid)" },
            ]}
            size={RING_SIZES.preview}
            className={styles.rings}
          />
          <span className={styles.stat}>
            <span className={styles.statLabel}>SENDS</span>
            <span className={styles.statValue}>8</span>
          </span>
          <span className={styles.points}>
            <span className={styles.pointsValue}>24</span>
            <span className={styles.statLabel}>PTS</span>
          </span>
        </span>

        <span className={styles.tiles}>
          <span className={`${styles.tile} ${styles.sent}`} />
          <span className={`${styles.tile} ${styles.flashed}`} />
          <span className={`${styles.tile} ${styles.attempted}`} />
          <span className={styles.tile} />
        </span>
      </span>
    </span>
  );
}
