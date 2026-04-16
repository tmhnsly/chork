import { redirect } from "next/navigation";
import { createServerSupabase, getServerUser } from "@/lib/supabase/server";
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
  const supabase = await createServerSupabase();
  const user = await getServerUser();
  if (!user) redirect("/login?next=/admin");

  return (
    <div className={styles.shell}>
      <AdminNav />
      {children}
    </div>
  );
}
