import type { ThemeName } from "@/lib/theme-store";
import styles from "./themePreview.module.scss";

interface Props {
  theme: ThemeName;
  className?: string;
}

/**
 * A miniature of the wall, rendered in one palette.
 *
 * Scoped with `data-theme`, so it paints in `theme` regardless of
 * which palette the surrounding app is using — every theme, including
 * the default, is declared as a `[data-theme]` block for exactly this
 * reason. Nothing here reads the active theme or mutates anything.
 *
 * It shows the four tile states the send grid actually uses — sent,
 * flashed, attempted, untouched — because those are what a palette
 * has to keep distinguishable, and the reason a theme can't just pick
 * any accent it likes. Seeing accent next to amber and teal at a
 * glance is the whole point: two colour dots could tell you a theme
 * was "pink-ish" but not whether a send would still read differently
 * from a flash.
 *
 * `aria-hidden` throughout — it's decoration. The option's own label
 * and checked state carry the meaning for assistive tech, and naming
 * four abstract squares would only add noise.
 */
export function ThemePreview({ theme, className }: Props) {
  return (
    <span
      className={[styles.root, className].filter(Boolean).join(" ")}
      data-theme={theme}
      aria-hidden="true"
    >
      <span className={styles.card}>
        <span className={styles.header}>
          <span className={styles.title} />
          <span className={styles.pill} />
        </span>
        <span className={styles.tiles}>
          <span className={`${styles.tile} ${styles.sent}`} />
          <span className={`${styles.tile} ${styles.flashed}`} />
          <span className={`${styles.tile} ${styles.attempted}`} />
          <span className={`${styles.tile} ${styles.untouched}`} />
        </span>
      </span>
    </span>
  );
}
