import { ChorkMark, LinkButton } from "@/components/ui";
import { CLOSE } from "./copy";
import styles from "./closing.module.scss";

/** The last ask, on the only accent plane on the page. */
export function Close() {
  return (
    <section className={styles.close}>
      <ChorkMark mode="on-accent" className={styles.closeMark} />
      <h2 className={styles.closeHeadline}>{CLOSE.headline}</h2>
      <LinkButton href="/login" variant="onAccent">{CLOSE.cta}</LinkButton>
    </section>
  );
}
