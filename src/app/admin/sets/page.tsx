import Link from "next/link";
import { redirect } from "next/navigation";
import { FaPlus } from "react-icons/fa6";
import { requireGymAdmin } from "@/lib/auth";
import { getAllSetsForAdminGym, type AdminSetSummary } from "@/lib/data/admin-queries";
import { formatSetLabel } from "@/lib/data/set-label";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { SetStatusBadge } from "@/components/admin/SetStatusBadge";
import { getGym } from "@/lib/data/queries";
import styles from "./sets.module.scss";

export const metadata = {
  title: "Sets - Admin - Chork",
};

export default async function AdminSetsPage() {
  const auth = await requireGymAdmin();
  if ("error" in auth) redirect("/");
  const { supabase, gymId, isOwner } = auth;

  const [gym, sets] = await Promise.all([
    getGym(supabase, gymId),
    getAllSetsForAdminGym(supabase, gymId),
  ]);

  return (
    <main className={styles.page}>
      <AdminHeader gymName={gym?.name ?? "Your gym"} isOwner={isOwner} />

      <div className={styles.toolbar}>
        <h2 className={styles.sectionTitle}>Sets</h2>
        <Link href="/admin/sets/new" className={styles.newBtn}>
          <FaPlus aria-hidden /> New set
        </Link>
      </div>

      {sets.length === 0 ? (
        <p className={styles.empty}>No sets yet. Create your first one above.</p>
      ) : (
        <ul className={styles.list} aria-label="All sets">
          {sets.map((set) => (
            <SetRow key={set.id} set={set} />
          ))}
        </ul>
      )}
    </main>
  );
}

function SetRow({ set }: { set: AdminSetSummary }) {
  return (
    <li>
      <Link href={`/admin/sets/${set.id}`} className={styles.row}>
        <div className={styles.rowText}>
          <span className={styles.rowLabel}>{formatSetLabel(set)}</span>
          <span className={styles.rowMeta}>
            {set.grading_scale === "points"
              ? "Points only"
              : `${set.grading_scale.toUpperCase()}-scale · max ${set.max_grade}`}
          </span>
        </div>
        <SetStatusBadge status={set.status} />
      </Link>
    </li>
  );
}
