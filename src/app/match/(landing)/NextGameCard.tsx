import { FaPlus, FaUserPlus } from "react-icons/fa6";
import { LinkButton } from "@/components/ui";
import styles from "./match.module.scss";

/**
 * The Start / Join card. Static — no data — so the page and its
 * loading skeleton render the SAME component, and the skeleton can
 * never drift from it.
 */
export function NextGameCard() {
  return (
    <section className={styles.actionsCard} aria-label="Start or join a game">
      <div className={styles.actionHeader}>
        <h2 className={styles.actionHeading}>Your next game</h2>
        <p className={styles.actionLede}>
          A game is a quick comp you run yourself. Set the routes, log
          your goes, watch the board move. Start one for your mates,
          play a week of your league, or join with a code someone sent
          you.
        </p>
      </div>
      <div className={styles.actionButtons}>
        <LinkButton href="/match/new" flex>
          <FaPlus aria-hidden /> Start a game
        </LinkButton>
        <LinkButton href="/match/join" variant="secondary" flex>
          <FaUserPlus aria-hidden /> Join a game
        </LinkButton>
      </div>
    </section>
  );
}
