import styles from "./pageBackdrop.module.scss";

/**
 * The app's ground: one fixed layer behind every page, lit by the
 * theme's own chord — accent from the top left, flash gold from the
 * bottom right, a breath of zone colour between. Fixed, so it holds
 * still while the page scrolls over it and the navbar's glass always
 * has the same light to blur; three lights, not one, so a page reads
 * as a place rather than a grey sheet with a spotlight on it.
 *
 * Decorative and non-interactive. Tokens only, so every theme and
 * both modes light it with their own colours.
 */
export function PageBackdrop() {
  return <div className={styles.backdrop} aria-hidden />;
}
