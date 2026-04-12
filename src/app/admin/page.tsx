import { requireGymAdmin } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getGym } from "@/lib/data/queries";
import { getActiveSetForAdminGym } from "@/lib/data/admin-queries";
import { AdminDashboardEmpty } from "@/components/admin/AdminDashboardEmpty";
import { AdminHeader } from "@/components/admin/AdminHeader";
import styles from "./admin.module.scss";

export const metadata = {
  title: "Admin - Chork",
};

/**
 * Admin dashboard landing page. Resolves the caller's admin gym
 * server-side, then shows either an empty state (no active set yet
 * with a CTA to create one) or the dashboard. The dashboard widgets
 * themselves ship in a later phase.
 */
export default async function AdminHomePage() {
  const auth = await requireGymAdmin();
  if ("error" in auth) redirect("/");
  const { supabase, gymId, isOwner } = auth;

  const [gym, activeSet] = await Promise.all([
    getGym(supabase, gymId),
    getActiveSetForAdminGym(supabase, gymId),
  ]);

  return (
    <main className={styles.page}>
      <AdminHeader gymName={gym?.name ?? "Your gym"} isOwner={isOwner} />

      {activeSet === null ? (
        <AdminDashboardEmpty />
      ) : (
        <section className={styles.dashboardPlaceholder} aria-label="Dashboard">
          <p className={styles.note}>
            Dashboard widgets ship in the next phase. Active set:{" "}
            <strong>{activeSet.name ?? "Untitled"}</strong>.
          </p>
        </section>
      )}
    </main>
  );
}
