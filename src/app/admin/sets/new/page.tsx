import { redirect } from "next/navigation";
import { requireGymAdmin } from "@/lib/auth";
import { SetForm } from "@/components/admin/SetForm";
import styles from "./new.module.scss";

export const metadata = {
  title: "New set - Admin - Chork",
};

/**
 * Admin server page that renders the set-creation form. The gym ID is
 * derived server-side from `requireGymAdmin()` — never trusted from the
 * client — and passed to the form as a hidden input.
 */
export default async function NewSetPage() {
  const auth = await requireGymAdmin();
  if ("error" in auth) redirect("/");
  return (
    <main className={styles.page}>
      <h1 className={styles.title}>New set</h1>
      <SetForm mode="create" gymId={auth.gymId} />
    </main>
  );
}
