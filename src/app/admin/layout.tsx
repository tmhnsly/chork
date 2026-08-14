import { redirect } from "next/navigation";
import { createServerSupabase, getServerUser } from "@/lib/supabase/server";
import { getAdminGymsForUser } from "@/lib/data/admin-queries";
import { AdminNav } from "@/components/admin/AdminNav";
import styles from "./layout.module.scss";

/**
 * Admin route group. The /admin shell hosts two orthogonal roles:
 *   • gym admin (sets, routes, dashboard widgets)
 *   • competition organiser (competitions)
 *
 * Both require a signed-in user, so the layout only checks sign-in.
 * Each child page enforces its own role via `requireGymAdmin` or the
 * per-competition organiser-id check — RLS then gates every query as
 * the second, authoritative layer.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getServerUser();
  if (!user) redirect("/login?next=/admin");

  // Feeds the nav's gym switcher. One indexed `gym_admins` read, and
  // the switcher only renders for admins of more than one gym — but
  // the list has to be fetched to know that. Both clients are
  // request-cached, so this doesn't add a round-trip for the pages
  // that already resolve an admin gym.
  const supabase = await createServerSupabase();
  const gyms = await getAdminGymsForUser(supabase, user.id);

  return (
    <div className={styles.shell}>
      <AdminNav gyms={gyms.map((g) => ({ id: g.id, name: g.name }))} />
      {children}
    </div>
  );
}
