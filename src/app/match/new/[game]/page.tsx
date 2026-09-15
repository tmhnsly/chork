import { notFound, redirect } from "next/navigation";
import { FaArrowLeft } from "react-icons/fa6";
import { requireSignedIn } from "@/lib/auth";
import { getServerProfile } from "@/lib/supabase/server";
import { getUserSavedScales } from "@/lib/data/match-queries";
import { defaultGameName } from "@/lib/data/match-title";
import { PageHeader } from "@/components/motion";
import { IconLink } from "@/components/ui";
import { GameSetupForm } from "@/components/Match/GameSetupForm";
import styles from "./setup.module.scss";

export const metadata = { title: "Set up a game" };

const GAME_TITLES = { points: "Points", chork: "Chork" } as const;

interface Props {
  params: Promise<{ game: string }>;
}

/**
 * A game's setup page, reached from its poster on `/match/new`.
 *
 * The game doesn't exist yet: the form creates it on Start game and
 * opens the game screen. Back returns to the posters with nothing made.
 */
export default async function GameSetupPage({ params }: Props) {
  const { game } = await params;
  if (game !== "points" && game !== "chork") notFound();

  const auth = await requireSignedIn();
  if ("error" in auth) redirect("/login");

  // Saved ladders are the climber's own: read with their client, not
  // the service role.
  const [profile, savedScales] = await Promise.all([
    getServerProfile(),
    getUserSavedScales(auth.supabase),
  ]);

  return (
    <main className={styles.page}>
      <div className={styles.topRow}>
        <IconLink href="/match/new" label="Pick a different game">
          <FaArrowLeft />
        </IconLink>
      </div>
      <PageHeader
        title={`${GAME_TITLES[game]} game`}
        subtitle="Name it, choose what you're climbing, then start."
      />
      <GameSetupForm game={game} defaultName={defaultGameName(profile)} savedScales={savedScales} />
    </main>
  );
}
