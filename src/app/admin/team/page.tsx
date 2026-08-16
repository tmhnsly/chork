import { redirect } from "next/navigation";
import { requireGymAdmin } from "@/lib/auth";
import { getGymTeam, getPendingInvites } from "@/lib/data/admin-queries";
import { PageHeader } from "@/components/motion";
import { AdminTeam } from "@/components/admin/AdminTeam";
import styles from "./team.module.scss";

export const metadata = {
  title: "Team - Admin",
};

interface Props {
  /** `?gym=` picks which gym's team, for admins of more than one.
   *  Verified by requireGymAdmin, so a forged id is rejected. */
  searchParams: Promise<{ gym?: string }>;
}

/**
 * Who runs this gym, and who has been invited to.
 *
 * `sendAdminInvite` and `cancelAdminInvite` were fully written and
 * tested with no caller anywhere — an invite could be accepted
 * (`/admin/invite/[token]` has always worked) but never sent. This is
 * the missing half, not new capability.
 *
 * Gym-scoped like the rest of the shell: the picker in `AdminNav`
 * carries `?gym=` and every page re-verifies it.
 */
export default async function AdminTeamPage({ searchParams }: Props) {
  const { gym: gymParam } = await searchParams;
  const auth = await requireGymAdmin(gymParam);
  if ("error" in auth) redirect("/");

  const [team, invites] = await Promise.all([
    getGymTeam(auth.supabase, auth.gymId),
    getPendingInvites(auth.supabase, auth.gymId),
  ]);

  return (
    <main className={styles.page}>
      <PageHeader
        title="Team"
        subtitle="Who can manage this gym's sets and routes."
      />
      <AdminTeam
        gymId={auth.gymId}
        isOwner={auth.isOwner}
        team={team}
        invites={invites}
      />
    </main>
  );
}
