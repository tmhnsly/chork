import { notFound, redirect } from "next/navigation";
import { format, parseISO } from "date-fns";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  getCompetitionById,
  getCompetitionCategories,
  getCompetitionGyms,
  getMyCompetitionParticipation,
} from "@/lib/data/competition-queries";
import { CompetitionLeaderboard } from "@/components/Competitions/CompetitionLeaderboard";
import { CompetitionJoinBar } from "@/components/Competitions/CompetitionJoinBar";
import styles from "./competition.module.scss";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  const supabase = await createServerSupabase();
  const competition = await getCompetitionById(supabase, id);
  return { title: `${competition?.name ?? "Competition"} - Chork` };
}

export default async function CompetitionDetailPage({ params }: Props) {
  const { id } = await params;

  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/competitions/${id}`);

  const competition = await getCompetitionById(supabase, id);
  if (!competition) notFound();

  // Draft comps are hidden from everyone except the organiser — keeps
  // unpublished prep work invisible while setters iterate.
  if (competition.status === "draft" && competition.organiser_id !== user.id) {
    notFound();
  }

  const [categories, gyms, participation] = await Promise.all([
    getCompetitionCategories(supabase, id),
    getCompetitionGyms(supabase, id),
    getMyCompetitionParticipation(supabase, id, user.id),
  ]);

  const dateRange = [
    format(parseISO(competition.starts_at), "MMM d"),
    competition.ends_at ? format(parseISO(competition.ends_at), "MMM d yyyy") : null,
  ].filter(Boolean).join(" – ");

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>{competition.name}</h1>
        <p className={styles.subtitle}>
          {dateRange}
          {gyms.length > 0 && ` · ${gyms.length} ${gyms.length === 1 ? "gym" : "gyms"}`}
        </p>
        {competition.description && (
          <p className={styles.description}>{competition.description}</p>
        )}
      </header>

      <CompetitionJoinBar
        competitionId={id}
        categories={categories}
        participation={participation}
      />

      <CompetitionLeaderboard
        competitionId={id}
        categories={categories}
        currentUserId={user.id}
      />
    </main>
  );
}
