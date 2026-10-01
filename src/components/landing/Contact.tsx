import { CONTACT } from "./copy";
import styles from "./closing.module.scss";

/** One line and an address: who to ask, and how. */
export function Contact() {
  return (
    <section className={styles.contact}>
      <h2 className={styles.contactHeadline}>{CONTACT.headline}</h2>
      <p className={styles.contactBody}>
        {CONTACT.lead} {CONTACT.action}{" "}
        <a href={`mailto:${CONTACT.address}`}>{CONTACT.address}</a>.
      </p>
    </section>
  );
}
