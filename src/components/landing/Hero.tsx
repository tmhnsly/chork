import { RevealText } from "@/components/motion";
import { ChorkMark, LinkButton } from "@/components/ui";
import { HERO } from "./copy";
import { DeviceFrame } from "./DeviceFrame";
import { CardScreen } from "./CardScreen";
import styles from "./hero.module.scss";

/** What is this, is it for me, what does it cost, where do I start. */
export function Hero() {
  return (
    <section className={styles.hero}>
      <p className={styles.brand}>
        <ChorkMark size={20} mode="accent" />
        Chork
      </p>
      <RevealText as="h1" text={HERO.headline} className={styles.headline} />
      <p className={styles.body}>{HERO.body}</p>
      <div className={styles.cta}>
        <LinkButton href="/login">{HERO.cta}</LinkButton>
      </div>
      <div className={styles.device}>
        <DeviceFrame label={HERO.deviceLabel}>
          <CardScreen step={0} />
        </DeviceFrame>
      </div>
    </section>
  );
}
