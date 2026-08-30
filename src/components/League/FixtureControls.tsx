"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FaCalendarPlus, FaTrophy } from "react-icons/fa6";
import { BottomSheet, Button, ChoiceTiles, SheetBody, showToast } from "@/components/ui";
import type { MyLeagueRow } from "@/lib/data/league-types";
import { addMatchToLeagueAction, createLeagueAction } from "@/app/match/league-actions";
import styles from "./fixtureSheets.module.scss";

interface Props {
  setId: string;
  matchName: string;
  /** The host's running Leagues. Empty → only "Make this a fixture". */
  leagues: MyLeagueRow[];
}

const MAX_NAME = 80;

/**
 * The two ways a finished Match becomes a week: start a League from
 * it, or add it to one the host already runs. Host only — the page
 * doesn't render this for anyone else, and the RPC refuses them
 * anyway.
 */
export function FixtureControls({ setId, matchName, leagues }: Props) {
  const router = useRouter();
  const [sheet, setSheet] = useState<"none" | "create" | "add">("none");
  const [name, setName] = useState(matchName);
  // `ChoiceTiles` wants a value; the sheet only opens when there is
  // at least one league to pick.
  const [leagueId, setLeagueId] = useState<string>(leagues[0]?.id ?? "");
  const [pending, startTransition] = useTransition();
  const trimmed = name.trim();

  function create() {
    startTransition(async () => {
      const result = await createLeagueAction(trimmed, setId);
      if ("error" in result) {
        showToast(result.error, "error");
        return;
      }
      router.push(`/match/league/${result.leagueId}`);
    });
  }

  function add() {
    if (!leagueId) return;
    startTransition(async () => {
      const result = await addMatchToLeagueAction(leagueId, setId);
      if ("error" in result) {
        showToast(result.error, "error");
        return;
      }
      router.push(`/match/league/${leagueId}`);
    });
  }

  return (
    <div className={styles.controls}>
      <Button type="button" variant="secondary" fullWidth onClick={() => setSheet("create")}>
        <FaTrophy aria-hidden /> Make this a fixture
      </Button>
      {leagues.length > 0 && (
        <Button type="button" variant="secondary" fullWidth onClick={() => setSheet("add")}>
          <FaCalendarPlus aria-hidden /> Add to a league
        </Button>
      )}

      {sheet === "create" && (
        <BottomSheet open onClose={() => setSheet("none")} title="Start a league">
          <SheetBody>
            <label className={styles.field}>
              <span className={styles.label}>League name</span>
              <input
                type="text"
                className={styles.input}
                value={name}
                maxLength={MAX_NAME}
                placeholder="e.g. Tuesday league"
                autoFocus
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && trimmed && !pending) create();
                }}
              />
              <span className={styles.hint}>
                This match becomes week 1. Everyone who climbed in it is on the table.
              </span>
            </label>
            <Button type="button" onClick={create} disabled={!trimmed || pending} fullWidth>
              <FaTrophy aria-hidden /> Start the league
            </Button>
          </SheetBody>
        </BottomSheet>
      )}

      {sheet === "add" && (
        <BottomSheet open onClose={() => setSheet("none")} title="Add to a league">
          <SheetBody>
            <ChoiceTiles
              ariaLabel="Which league"
              value={leagueId}
              onChange={(v) => setLeagueId(v)}
              options={leagues.map((l) => ({
                value: l.id,
                label: l.name,
                detail: `${l.week_count} ${l.week_count === 1 ? "week" : "weeks"}`,
              }))}
            />
            <Button type="button" onClick={add} disabled={!leagueId || pending} fullWidth>
              <FaCalendarPlus aria-hidden /> Add as the next week
            </Button>
          </SheetBody>
        </BottomSheet>
      )}
    </div>
  );
}
