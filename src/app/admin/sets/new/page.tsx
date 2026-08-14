import { redirect } from "next/navigation";
import { requireGymAdmin } from "@/lib/auth";
import { SetForm } from "@/components/admin/SetForm";
import { PageHeader } from "@/components/motion";
import styles from "./new.module.scss";

export const metadata = {
  title: "New set - Admin - Chork",
};

interface Props {
  /** `?gym=` picks which gym the new set belongs to, for admins of
   *  more than one. Verified by requireGymAdmin below. */
  searchParams: Promise<{ gym?: string }>;
}

/**
 * Admin server page that renders the set-creation form. The gym ID is
 * derived server-side from `requireGymAdmin()` — never trusted from the
 * client — and passed to the form as a hidden input.
 */
export default async function NewSetPage({ searchParams }: Props) {
  const { gym: gymParam } = await searchParams;
  const auth = await requireGymAdmin(gymParam);
  if ("error" in auth) redirect("/");
  return (
    <main className={styles.page}>
      <PageHeader title="New set" />
      <SetForm mode="create" gymId={auth.gymId} />
    </main>
  );
}
