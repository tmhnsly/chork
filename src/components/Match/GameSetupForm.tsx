"use client";

import { useReducer, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FaPlay } from "react-icons/fa6";
import { Button, FormField, showToast } from "@/components/ui";
import { SectionCard } from "@/components/ui/SectionCard";
import type { SavedScale } from "@/lib/data/match-types";
import { createMatchAction, setMatchGameMode } from "@/app/match/actions";
import { GradingSetup } from "./GradingSetup";
import {
  MAX_CUSTOM_GRADES,
  buildCreateMatchPayload,
  canSubmit,
  createMatchReducer,
  initialCreateMatchState,
  newGamePrefill,
} from "./createMatchReducer";
import styles from "./gameSetupForm.module.scss";

interface Props {
  game: "points" | "chork";
  /** "Tom's game": what a climber who changes nothing still gets. */
  defaultName: string;
  /** The climber's saved custom ladders, for the grading picker. */
  savedScales: SavedScale[];
}

/**
 * A game's setup, before the game exists: its name and where, then
 * what's being climbed and how it's graded, then Start game.
 *
 * Nothing is created until that button. Tapping a poster used to BE
 * creating the game, and a stray tap made games nobody meant to start
 * (found testing at Yonder). The fields start from the defaults a
 * poster used to create with, so a game you don't want to change is
 * still two taps.
 *
 * Deliberately not a <form>: Enter in the name field must not start a
 * game. The same reducer and grading picker drive the game screen's
 * setup sheet, so a game is set up the same way before it exists and
 * before its first route. Renders into the page's own stack, so the
 * cards keep the page rhythm.
 */
export function GameSetupForm({ game, defaultName, savedScales }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [state, dispatch] = useReducer(
    createMatchReducer,
    newGamePrefill(game, defaultName),
    initialCreateMatchState,
  );

  function start() {
    startTransition(async () => {
      const payload = buildCreateMatchPayload(state);
      const result = await createMatchAction(payload);
      if ("error" in result) {
        showToast(result.error, "error");
        return;
      }
      // Set after creation rather than as another argument to
      // `create_match` (see the note on `setMatchGameMode`). A failure
      // here leaves a playable points game rather than nothing.
      if (payload.gameMode === "chork") {
        const mode = await setMatchGameMode(result.id, "chork");
        if ("error" in mode) showToast(mode.error, "error");
      }
      router.push(`/match/${result.id}`);
    });
  }

  return (
    <>
      <SectionCard title="Details">
        <div className={styles.fields}>
          <FormField
            id="setup-name"
            label="Name"
            type="text"
            value={state.name}
            maxLength={80}
            placeholder="e.g. Friday sesh"
            onChange={(e) => dispatch({ type: "set-name", value: e.target.value })}
          />
          <FormField
            id="setup-location"
            label="Where"
            type="text"
            value={state.location}
            maxLength={120}
            placeholder="e.g. Fontainebleau, the garage"
            onChange={(e) => dispatch({ type: "set-location", value: e.target.value })}
          />
        </div>
      </SectionCard>

      <SectionCard title="What you're climbing">
        <GradingSetup
          state={state}
          dispatch={dispatch}
          savedScales={savedScales}
          onMaxGrades={() => showToast(`Max ${MAX_CUSTOM_GRADES} grades`, "error")}
        />
      </SectionCard>

      <Button
        type="button"
        onClick={start}
        fullWidth
        loading={pending}
        disabled={!canSubmit(state, pending)}
      >
        <FaPlay aria-hidden /> Start game
      </Button>
    </>
  );
}
