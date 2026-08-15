import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { FaListUl } from "react-icons/fa6";
import { requireAdminOfSet } from "@/lib/auth";
import { getSetForAdmin } from "@/lib/data/admin-queries";
import { SetForm } from "@/components/admin/SetForm";
import { PageHeader } from "@/components/motion";
import styles from "./edit.module.scss";

export const metadata = {
  title: "Edit set - Admin",
};

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditSetPage({ params }: Props) {
  const { id } = await params;

  // Authorise against the SET's gym, not the admin's default one.
  // `requireGymAdmin()` with no argument resolves to the caller's
  // oldest gym_admins row, so authorising against that 404'd every
  // set belonging to any other gym the admin runs.
  const gate = await requireAdminOfSet(id);
  if ("error" in gate) {
    // Not an admin at all -> home. Bad or missing set id -> 404.
    if (gate.reason === "forbidden") redirect("/");
    notFound();
  }
  const { auth, setRow } = gate;

  const set = await getSetForAdmin(auth.supabase, id);
  if (!set) notFound();

  return (
    <main className={styles.page}>
      <PageHeader title="Edit set" />
      <Link href={`/admin/sets/${id}/routes`} className={styles.routesLink}>
        <FaListUl aria-hidden /> Manage routes
      </Link>
      <SetForm
        mode="edit"
        gymId={setRow.gym_id}
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
