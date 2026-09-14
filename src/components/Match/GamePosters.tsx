"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FaArrowRight, FaSpinner } from "react-icons/fa6";
import { showToast } from "@/components/ui";
import { GameScene, type GameScenePreset } from "@/components/motion";
import { SCALE_HARD_MAX } from "@/lib/data/grade-label";
import { createMatchAction, setMatchGameMode } from "@/app/match/actions";
import type { CreateMatchPrefill } from "./createMatchReducer";
import styles from "./gamePosters.module.scss";

interface Props {
  /** "Tom's game" — stored on the row, editable from the lobby. */
  defaultName: string;
  /** Starting a week of a League: last week's settings, not the defaults. */
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
 * Two scene cards; tapping one IS creating the match. Everything else
 * about a match is set from the lobby, where the people it's for can
 * see it happen. Glass over the page's wash, each with its game's
 * scene on top and an arrow in that game's colour — the whole card is
 * the button, so it doesn't need to say "start".
 */
export function GamePosters({ defaultName, prefill }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [tapped, setTapped] = useState<GameScenePreset | null>(null);

  function start(mode: GameScenePreset) {
    setTapped(mode);
    startTransition(async () => {
      const payload = prefill
        ? {
            name: prefill.name,
            location: prefill.location,
            discipline: prefill.discipline,
            gradingScale: prefill.scale,
            minGrade: prefill.minGrade,
            maxGrade: prefill.maxGrade,
            handicap: prefill.handicap,
            altGradingScale: prefill.altScale,
            altMinGrade: prefill.altMinGrade,
            altMaxGrade: prefill.altMaxGrade,
            leagueId: prefill.leagueId,
          }
        : {
            name: defaultName,
            discipline: "boulder" as const,
            gradingScale: "v" as const,
            minGrade: 0,
            maxGrade: SCALE_HARD_MAX.v,
          };
      const result = await createMatchAction(payload);
      if ("error" in result) {
        showToast(result.error, "error");
        setTapped(null);
        return;
      }
      // Set after creation rather than as a fourteenth argument to
      // `create_match` — see the note on `setMatchGameMode`. A failure
      // here leaves a playable points match rather than nothing.
      if (mode === "chork") {
        const r = await setMatchGameMode(result.id, "chork");
        if ("error" in r) showToast(r.error, "error");
      }
      router.push(`/match/${result.id}`);
    });
  }

  return (
    <div className={styles.posters}>
      {POSTERS.map((p, i) => (
        <button
          key={p.mode}
          type="button"
          className={styles.poster}
          data-game={p.mode}
          style={{ "--i": i } as React.CSSProperties}
          onClick={() => start(p.mode)}
          disabled={pending}
          aria-busy={tapped === p.mode || undefined}
          aria-label={`Start a ${p.title} game`}
        >
          <GameScene preset={p.mode} />
          <span className={styles.body}>
            <span className={styles.text}>
              <span className={styles.title}>{p.title}</span>
              <span className={styles.line}>{p.line}</span>
            </span>
            <span className={styles.go} aria-hidden>
              {tapped === p.mode ? (
                <FaSpinner className={styles.spinner} />
              ) : (
                <FaArrowRight />
              )}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}
