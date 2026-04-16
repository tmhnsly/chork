import { notFound, redirect } from "next/navigation";
import { requireSignedIn } from "@/lib/auth";
import {
  getCompetitionGyms,
  getCompetitionCategories,
  getCompetitionVenueStats,
} from "@/lib/data/competition-queries";
import { getCompetitionById } from "@/lib/data/competition-by-id";
import { getAdminGymsForUser } from "@/lib/data/admin-queries";
import { CompetitionForm } from "@/components/admin/CompetitionForm";
import { CompetitionGymsPanel } from "@/components/admin/CompetitionGymsPanel";
import { CompetitionCategoriesPanel } from "@/components/admin/CompetitionCategoriesPanel";
import { VenueStatsWidget } from "@/components/admin/dashboard/VenueStatsWidget";
import { PageHeader } from "@/components/motion";
import styles from "./edit.module.scss";

export const metadata = {
  title: "Edit competition - Admin - Chork",
};

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditCompetitionPage({ params }: Props) {
  const { id } = await params;
  const auth = await requireSignedIn();
  if ("error" in auth) redirect("/login");
  const { supabase, userId } = auth;

  const competition = await getCompetitionById(id);
  if (!competition) notFound();
  if (competition.organiser_id !== userId) redirect("/admin/competitions");

  const [linkedGyms, categories, myGyms, venueStats] = await Promise.all([
    getCompetitionGyms(supabase, id),
    getCompetitionCategories(supabase, id),
    getAdminGymsForUser(supabase, userId),
    getCompetitionVenueStats(supabase, id),
  ]);

  return (
    <main className={styles.page}>
      <PageHeader
        title={competition.name}
        subtitle="Edit competition details, gyms and categories."
      />

      <CompetitionForm
        mode="edit"
        competition={{
          id: competition.id,
          name: competition.name,
          description: competition.description ?? "",
          startsAt: competition.starts_at,
          endsAt: competition.ends_at,
          status: competition.status,
        }}
      />

      <CompetitionGymsPanel
        competitionId={id}
        linkedGyms={linkedGyms}
        myGyms={myGyms}
      />

      <CompetitionCategoriesPanel
        competitionId={id}
        categories={categories}
      />

      {linkedGyms.length > 0 && <VenueStatsWidget venues={venueStats} />}
    </main>
  );
}
