import { SiteFooter } from "@/components/landing/SiteFooter";
import { Hero } from "@/components/landing/Hero";
import { PinnedSection, ArrivalSection } from "@/components/landing/Section";
import { Ladder } from "@/components/landing/Ladder";
import { QuietGrid } from "@/components/landing/QuietGrid";
import { Contact } from "@/components/landing/Contact";
import { Close } from "@/components/landing/Close";
import { CARD_STEPS } from "@/components/landing/screens/cardScreen";
import { BOARD_STEPS } from "@/components/landing/screens/boardScreen";
import { ANYWHERE, BOARD, LOG } from "@/components/landing/copy";
import styles from "./landing.module.scss";

/**
 * The logged-out homepage. A sequence of screens, each one claim and
 * the product doing the thing — the real app on a phone, with
 * fixture data, changing state as the reader scrolls. The order is
 * the order a stranger asks in: what is this, how do I use it, how is
 * it scored, where do I stand, can I run my own, what else, who made
 * it, how do I join. See docs/superpowers/specs/2026-09-30-marketing-page-design.md.
 */
export function LandingPage() {
  return (
    <div className={styles.page}>
      <main>
      <Hero />

      <PinnedSection headline={LOG.headline} body={LOG.body} steps={CARD_STEPS} deviceLabel={LOG.deviceLabel} screen="card" />

      <Ladder />

      <PinnedSection headline={BOARD.headline} body={BOARD.body} steps={BOARD_STEPS} deviceLabel={BOARD.deviceLabel} screen="board" />

      <ArrivalSection headline={ANYWHERE.headline} body={ANYWHERE.body} deviceLabel={ANYWHERE.deviceLabel} screen="game" />

      <QuietGrid />
      <Contact />
      <Close />
      </main>
      <SiteFooter />
    </div>
  );
}
