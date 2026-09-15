"use client";

import { useReducer } from "react";
import {
  BottomSheet,
  Button,
  ChoiceTiles,
  FormField,
  SheetActions,
  SheetBody,
  showToast,
} from "@/components/ui";
import type { Match, SavedScale } from "@/lib/data/match-types";
import type { MatchSetupPayload } from "@/app/match/actions";
import { GradingSetup } from "./GradingSetup";
import {
  buildCreateMatchPayload,
  createMatchReducer,
  initialCreateMatchState,
  isFormulaScale,
  type CreateMatchPrefill,
} from "./createMatchReducer";
import type { SetupSection } from "./matchScreenReducer";
import styles from "./matchSetupSheet.module.scss";

interface Props {
  section: SetupSection;
  match: Match;
  grades: Array<{ ordinal: number; label: string }>;
  savedScales: SavedScale[];
  onSubmit: (payload: MatchSetupPayload) => Promise<boolean>;
  onGameMode: (mode: "points" | "chork") => void;
  pending: boolean;
  onClose: () => void;
}

const TITLES: Record<SetupSection, string> = {
  game: "What are you playing?",
  climbing: "What are you climbing?",
  details: "Details",
};

/** The match as the create reducer sees it — its state, hydrated. */
function prefillFrom(match: Match, grades: Props["grades"]): CreateMatchPrefill {
  const alt = match.alt_grading_scale;
  return {
    name: match.name ?? "",
    location: match.location,
    discipline: match.discipline,
    scale: match.grading_scale,
    handicap: match.handicap,
    gameMode: match.game_mode,
    minGrade: match.min_grade,
    maxGrade: match.max_grade,
    altScale: alt && isFormulaScale(alt) ? alt : null,
    altMinGrade: match.alt_min_grade,
    altMaxGrade: match.alt_max_grade,
    leagueId: match.league_id,
    customGrades: grades.map((g) => g.label),
  };
}

/**
 * One sheet, three sections, one reducer. The setup page's state
 * machine drives it — a match's setup is exactly what that reducer
 * models, so the game screen edits it with the same transitions
 * `GameSetupForm` creates it with, and `buildCreateMatchPayload`
 * produces what `set_match_setup` takes.
 *
 * Game mode is the one section that saves on tap: it has its own RPC
 * and no dependent fields, so a Save button would be a second tap
 * for nothing.
 */
export function MatchSetupSheet({
  section,
  match,
  grades,
  savedScales,
  onSubmit,
  onGameMode,
  pending,
  onClose,
}: Props) {
  const [state, dispatch] = useReducer(
    createMatchReducer,
    prefillFrom(match, grades),
    initialCreateMatchState,
  );

  async function save() {
    const p = buildCreateMatchPayload(state);
    await onSubmit({
      name: p.name,
      location: p.location,
      discipline: p.discipline,
      gradingScale: p.gradingScale,
      minGrade: p.minGrade,
      maxGrade: p.maxGrade,
      customGrades: p.customGrades,
      saveScaleName: p.saveScaleName,
      altGradingScale: p.altGradingScale,
      altMinGrade: p.altMinGrade,
      altMaxGrade: p.altMaxGrade,
    });
  }

  return (
    <BottomSheet open onClose={onClose} title={TITLES[section]}>
      <SheetBody>
        {section === "game" && (
          <ChoiceTiles<"points" | "chork">
            options={[
              { value: "points", label: "Points", detail: "Most points wins" },
              { value: "chork", label: "Chork", detail: "Miss and take a letter" },
            ]}
            value={match.game_mode}
            onChange={onGameMode}
            ariaLabel="Game mode"
          />
        )}
        {section === "climbing" && (
          <GradingSetup
            state={state}
            dispatch={dispatch}
            savedScales={savedScales}
            onMaxGrades={() => showToast("Max 50 grades", "error")}
          />
        )}
        {section === "details" && (
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
        )}
      </SheetBody>
      {section !== "game" && (
        <SheetActions>
          <Button type="button" onClick={save} loading={pending}>
            Save
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </SheetActions>
      )}
    </BottomSheet>
  );
}
