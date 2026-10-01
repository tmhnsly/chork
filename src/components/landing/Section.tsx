"use client";

import { useRef, type ReactNode } from "react";
import { useInView, useScrollStep } from "@/hooks/use-scroll-progress";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { useMediaQuery } from "@/hooks/use-media-query";
import { DeviceFrame } from "./DeviceFrame";
import { CardScreen } from "./CardScreen";
import { BoardScreen } from "./BoardScreen";
import { GameScreen } from "./GameScreen";
import styles from "./section.module.scss";

/**
 * Which app screen a section's device shows. A name, not a render
 * prop: the page is a server component and a function can't cross
 * into a client one, so the section owns the mapping.
 */
export type Screen = "card" | "board" | "game";

const SCREENS: Record<Screen, (props: { step: number }) => ReactNode> = {
  card: CardScreen,
  board: BoardScreen,
  game: GameScreen,
};

interface CopyProps {
  headline: string;
  body: string;
  as?: "h1" | "h2";
}

/** One claim: headline and a sentence, centred. */
export function SectionCopy({ headline, body, as: Tag = "h2" }: CopyProps) {
  return (
    <div className={styles.copy}>
      <Tag className={styles.headline}>{headline}</Tag>
      <p className={styles.body}>{body}</p>
    </div>
  );
}

interface PinnedProps extends CopyProps {
  /** How many states the device walks through across the pin. */
  steps: number;
  deviceLabel: string;
  screen: Screen;
}

/**
 * Too short to pin: a landscape phone (390px tall) left the device
 * 180px of screen, cutting the log sheet in half and the podium's
 * plinths off entirely. Below this the section doesn't pin at all.
 */
const TOO_SHORT_TO_PIN = "(max-height: 480px)";

/**
 * A section whose device changes state as the reader scrolls. The
 * copy is never gated: it is on screen from the first pixel of the
 * pin. Reduced motion — and a viewport too short to pin in — renders
 * the last state in normal flow.
 */
export function PinnedSection({ headline, body, steps, deviceLabel, screen }: PinnedProps) {
  const Device = SCREENS[screen];
  const ref = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();
  const tooShort = useMediaQuery(TOO_SHORT_TO_PIN);
  const still = reduced || tooShort;
  const scrolled = useScrollStep(ref, steps);
  const step = still ? steps - 1 : scrolled;

  return (
    <section ref={ref} className={styles.pinned} data-static={still ? "" : undefined}>
      <div className={styles.stage}>
        <SectionCopy headline={headline} body={body} />
        <div className={styles.device}>
          <DeviceFrame label={deviceLabel}><Device step={step} /></DeviceFrame>
        </div>
      </div>
    </section>
  );
}

interface ArrivalProps extends CopyProps {
  deviceLabel: string;
  screen: Screen;
}

/** A section whose device makes one change once it is on screen. */
export function ArrivalSection({ headline, body, deviceLabel, screen }: ArrivalProps) {
  const Device = SCREENS[screen];
  const ref = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();
  const inView = useInView(ref);
  const step = reduced || inView ? 1 : 0;

  return (
    <section ref={ref} className={styles.arrival}>
      <SectionCopy headline={headline} body={body} />
      <DeviceFrame label={deviceLabel}><Device step={step} /></DeviceFrame>
    </section>
  );
}
