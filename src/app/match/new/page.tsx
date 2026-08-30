import type { ComponentProps } from "react";
import { redirect } from "next/navigation";
import { requireSignedIn } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { getUserSavedScales, getMatchStateForUser } from "@/lib/data/match-queries";
import { getLeague } from "@/lib/data/league-queries";
import { isUuid } from "@/lib/validation";
import { PageHeader } from "@/components/motion";
import { CreateMatchForm } from "@/components/Match/CreateMatchForm";
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

  // Starting a week: pre-fill from the League's most recent week.
  // Only the host may (the RPC refuses anyone else), so a non-host
  // with the link just gets a plain new-match form.
  let league: ComponentProps<typeof CreateMatchForm>["league"];
  if (leagueParam && isUuid(leagueParam)) {
    const view = await getLeague(auth.supabase, leagueParam);
    if (view?.is_host && !view.league.ended_at) {
      const last = view.weeks[0];
      const lastState = last
        ? await getMatchStateForUser(createServiceClient(), last.set_id, auth.userId)
        : null;
      const weekNumber = view.weeks.filter((w) => w.status === "archived").length + 1;
      league = {
        id: view.league.id,
        name: view.league.name,
        weekNumber,
        prefill: {
          name: `${view.league.name} · week ${weekNumber}`,
          discipline: lastState?.match.discipline ?? "boulder",
          scale:
            lastState?.match.grading_scale === "custom"
              ? "points"
              : (lastState?.match.grading_scale ?? "points"),
          handicap: lastState?.match.handicap ?? false,
          gameMode: lastState?.match.game_mode ?? "points",
          minGrade: lastState?.match.min_grade ?? null,
          maxGrade: lastState?.match.max_grade ?? null,
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
      <CreateMatchForm savedScales={savedScales} league={league} />
    </main>
  );
}
