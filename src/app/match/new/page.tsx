import type { ComponentProps } from "react";
import { redirect } from "next/navigation";
import { requireSignedIn } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { getUserSavedScales, getMatchStateForUser } from "@/lib/data/match-queries";
import { getLeague } from "@/lib/data/league-queries";
import { isUuid } from "@/lib/validation";
import { PageHeader } from "@/components/motion";
import { CreateMatchForm } from "@/components/Match/CreateMatchForm";
import { isFormulaScale } from "@/components/Match/createMatchReducer";
import styles from "./new.module.scss";

export const metadata = { title: "Start a match" };

interface Props {
  searchParams: Promise<{ league?: string }>;
}

export default async function NewMatchPage({ searchParams }: Props) {
  const auth = await requireSignedIn();
  if ("error" in auth) redirect("/login");
  const { league: leagueParam } = await searchParams;

  const savedScales = await getUserSavedScales(auth.supabase);

  // Starting a week: pre-fill from the League's most recent FINISHED
  // week. Only the host may (the RPC refuses anyone else), so a
  // non-host with the link just gets a plain new-match form.
  let league: ComponentProps<typeof CreateMatchForm>["league"];
  if (leagueParam && isUuid(leagueParam)) {
    const view = await getLeague(auth.supabase, leagueParam);
    // `get_league` orders weeks newest-first INCLUDING a live one, so
    // `weeks[0]` can be this week already in progress. Starting a
    // second week on top of it would collide (same week number, same
    // generated name) — the League screen already hides "Start this
    // week's match" while a week is live, so mid-week here gets no
    // prefill at all rather than a wrong one.
    const hasLiveWeek = view?.weeks.some((w) => w.status === "live") ?? false;
    if (view?.is_host && !view.league.ended_at && !hasLiveWeek) {
      const last = view.weeks.find((w) => w.status === "archived");
      const lastState = last
        ? await getMatchStateForUser(createServiceClient(), last.set_id, auth.userId)
        : null;
      const match = lastState?.match;
      const altScale =
        match?.alt_grading_scale && isFormulaScale(match.alt_grading_scale)
          ? match.alt_grading_scale
          : null;
      const weekNumber = view.weeks.filter((w) => w.status === "archived").length + 1;
      league = {
        id: view.league.id,
        name: view.league.name,
        weekNumber,
        prefill: {
          name: `${view.league.name} · week ${weekNumber}`,
          location: match?.location ?? null,
          discipline: match?.discipline ?? "boulder",
          scale:
            match?.grading_scale === "custom" ? "points" : (match?.grading_scale ?? "points"),
          handicap: match?.handicap ?? false,
          gameMode: match?.game_mode ?? "points",
          minGrade: match?.min_grade ?? null,
          maxGrade: match?.max_grade ?? null,
          altScale,
          altMinGrade: match?.alt_min_grade ?? null,
          altMaxGrade: match?.alt_max_grade ?? null,
          leagueId: view.league.id,
        },
      };
    }
  }

  return (
    <main className={styles.page}>
      <PageHeader
        title={league ? `Week ${league.weekNumber}` : "Start a match"}
        subtitle={league ? league.name : "Set up a quick comp you can run anywhere."}
      />
      {/* Keyed on the league id (or its absence) so a client-side nav
          between two league links re-runs the reducer's lazy init —
          `useReducer`'s init function only fires once per mounted
          component instance otherwise. */}
      <CreateMatchForm key={league?.id ?? "none"} savedScales={savedScales} league={league} />
    </main>
  );
}
