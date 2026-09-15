"use client";

import { useState, useTransition, type ReactNode } from "react";
import Link, { useLinkStatus } from "next/link";
import { useRouter } from "next/navigation";
import { FaArrowRight, FaSpinner } from "react-icons/fa6";
import { showToast } from "@/components/ui";
import { GameScene, type GameScenePreset } from "@/components/motion";
import { createMatchAction, setMatchGameMode } from "@/app/match/actions";
import type { CreateMatchPrefill } from "./createMatchReducer";
import styles from "./gamePosters.module.scss";

interface Props {
  /**
   * Starting a week of a League: last week's settings. A league week
   * still starts on the tap, until leagues get their own setup flow.
   * Without it, a poster opens that game's setup page.
   */
  prefill?: CreateMatchPrefill;
}

const POSTERS: { mode: GameScenePreset; title: string; line: string }[] = [
  {
    mode: "points",
    title: "Points",
    line: "Every send scores. Most points wins.",
  },
  {
    mode: "chork",
    title: "Chork",
    line: "Set a route and send it. Match it, or take a letter.",
  },
];

/**
 * Two scene cards, one per game. A poster opens that game's setup page
 * (`/match/new/[game]`), and nothing is created until Start game there:
 * when the tap itself created the game, a stray tap made games nobody
 * meant to start. Glass over the page's wash, each with its game's
 * scene on top and an arrow in that game's colour — the whole card is
 * the link, so it doesn't need to say "start".
 *
 * League weeks are the exception for now: last week already chose
 * everything, so the tap starts the week, as before.
 */
export function GamePosters({ prefill }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [tapped, setTapped] = useState<GameScenePreset | null>(null);

  function startWeek(mode: GameScenePreset, week: CreateMatchPrefill) {
    setTapped(mode);
    startTransition(async () => {
      const result = await createMatchAction({
        name: week.name,
        location: week.location,
        discipline: week.discipline,
        gradingScale: week.scale,
        minGrade: week.minGrade,
        maxGrade: week.maxGrade,
        handicap: week.handicap,
        altGradingScale: week.altScale,
        altMinGrade: week.altMinGrade,
        altMaxGrade: week.altMaxGrade,
        leagueId: week.leagueId,
      });
      if ("error" in result) {
        showToast(result.error, "error");
        setTapped(null);
        return;
      }
      // Set after creation rather than as another argument to
      // `create_match` — see the note on `setMatchGameMode`. A failure
      // here leaves a playable points game rather than nothing.
      if (mode === "chork") {
        const r = await setMatchGameMode(result.id, "chork");
        if ("error" in r) showToast(r.error, "error");
      }
      router.push(`/match/${result.id}`);
    });
  }

  return (
    <div className={styles.posters}>
      {POSTERS.map((p, i) => {
        const face = (arrow: ReactNode) => (
          <>
            <GameScene preset={p.mode} />
            <span className={styles.body}>
              <span className={styles.text}>
                <span className={styles.title}>{p.title}</span>
                <span className={styles.line}>{p.line}</span>
              </span>
              <span className={styles.go} aria-hidden>
                {arrow}
              </span>
            </span>
          </>
        );
        return prefill ? (
          <button
            key={p.mode}
            type="button"
            className={styles.poster}
            data-game={p.mode}
            style={{ "--i": i } as React.CSSProperties}
            onClick={() => startWeek(p.mode, prefill)}
            disabled={pending}
            aria-busy={tapped === p.mode || undefined}
            aria-label={`Start this week as a ${p.title} game`}
          >
            {face(tapped === p.mode ? <FaSpinner className={styles.spinner} /> : <FaArrowRight />)}
          </button>
        ) : (
          <Link
            key={p.mode}
            href={`/match/new/${p.mode}`}
            // Full prefetch, as the tab links do: the tap lands on the
            // setup page inside the page transition, not on a wait.
            prefetch
            className={styles.poster}
            data-game={p.mode}
            style={{ "--i": i } as React.CSSProperties}
            aria-label={`Set up a ${p.title} game`}
          >
            {face(<LinkArrow />)}
          </Link>
        );
      })}
    </div>
  );
}

/**
 * A poster link's arrow, a spinner while its setup page loads on a
 * slow connection. It has to render inside the Link: `useLinkStatus`
 * reads the nearest one.
 */
function LinkArrow() {
  const { pending } = useLinkStatus();
  return pending ? <FaSpinner className={styles.spinner} /> : <FaArrowRight />;
}
