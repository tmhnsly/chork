import { redirect } from "next/navigation";
import { requireSignedIn } from "@/lib/auth";
import {
  getMyCrews,
  getPendingCrewInvites,
  getCrewMemberPreviews,
  type CrewMember,
} from "@/lib/data/crew-queries";
import { CrewPicker } from "@/components/Crew/CrewPicker";
import { PageHeader } from "@/components/motion";
import styles from "./crew.module.scss";

export const metadata = {
  title: "Crew - Chork",
};

export default async function CrewPage() {
  const auth = await requireSignedIn();
  if ("error" in auth) redirect("/login");
  const { supabase, userId } = auth;

  const [myCrews, invites] = await Promise.all([
    getMyCrews(supabase, userId),
    getPendingCrewInvites(supabase, userId),
  ]);

  // Avatar-stack previews for every crew card in one round-trip via
  // the batch RPC (migration 030). Scales cleanly whether the user
  // is in 2 crews or 40.
  const previewMap = await getCrewMemberPreviews(
    supabase,
    myCrews.map((c) => c.id),
    4,
  );
  const previews = Object.fromEntries(previewMap) as Record<
    string,
    Pick<CrewMember, "user_id" | "username" | "name" | "avatar_url">[]
  >;

  return (
    <main className={styles.page}>
      <PageHeader
        title="Crew"
        subtitle="Your climbing group, your private leaderboard."
      />
      <CrewPicker myCrews={myCrews} invites={invites} previews={previews} />
    </main>
  );
}
