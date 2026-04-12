import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { FaListUl } from "react-icons/fa6";
import { requireGymAdmin } from "@/lib/auth";
import { getAllSetsForAdminGym } from "@/lib/data/admin-queries";
import { SetForm } from "@/components/admin/SetForm";
import styles from "./edit.module.scss";

export const metadata = {
  title: "Edit set - Admin - Chork",
};

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditSetPage({ params }: Props) {
  const { id } = await params;
  const auth = await requireGymAdmin();
  if ("error" in auth) redirect("/");
  const { supabase, gymId } = auth;

  const sets = await getAllSetsForAdminGym(supabase, gymId);
  const set = sets.find((s) => s.id === id);
  if (!set) notFound();

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>Edit set</h1>
      <Link href={`/admin/sets/${id}/routes`} className={styles.routesLink}>
        <FaListUl aria-hidden /> Manage routes
      </Link>
      <SetForm
        mode="edit"
        gymId={gymId}
        set={{
          id: set.id,
          name: set.name,
          startsAt: set.starts_at,
          endsAt: set.ends_at,
          gradingScale: set.grading_scale,
          maxGrade: set.max_grade,
          status: set.status,
          closingEvent: set.closing_event,
        }}
      />
    </main>
  );
}
