import Link from "next/link";
import { requireGymAdmin } from "@/lib/auth";
import { getGym } from "@/lib/data/queries";
import { getActiveSetForAdminGym } from "@/lib/data/admin-queries";
import { AdminDashboardEmpty } from "@/components/admin/AdminDashboardEmpty";
import { AdminHeader } from "@/components/admin/AdminHeader";
import styles from "./admin.module.scss";

export const metadata = {
  title: "Admin - Chork",
};

/**
 * Admin dashboard landing page. Resolves the caller's admin gym if
 * they have one and shows either the empty state (no active set yet)
 * or the dashboard. Callers without any admin gym still land here via
 * the /admin shell — they see the "start a gym" CTA so they can opt
 * into being a gym admin without leaving the admin surface, and the
 * sub-nav lets them jump to Competitions (separate role) either way.
 */
export default async function AdminHomePage() {
  const auth = await requireGymAdmin();

  if ("error" in auth) {
    return (
      <main className={styles.page}>
        <section className={styles.noGymCard}>
          <h1 className={styles.noGymHeading}>No admin gym yet</h1>
          <p className={styles.noGymBody}>
            You aren&apos;t an admin of any gym right now. Start one to
            manage sets, routes, and climber engagement from here — or
            head to <Link href="/admin/competitions">Competitions</Link>
            {" "}to organise a multi-gym comp.
          </p>
          <Link href="/admin/signup" className={styles.noGymCta}>
            Start a gym
          </Link>
        </section>
      </main>
    );
  }

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
