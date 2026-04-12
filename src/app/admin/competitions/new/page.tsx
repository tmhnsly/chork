import { redirect } from "next/navigation";
import { requireSignedIn } from "@/lib/auth";
import { CompetitionForm } from "@/components/admin/CompetitionForm";
import styles from "./new.module.scss";

export const metadata = {
  title: "New competition - Admin - Chork",
};

export default async function NewCompetitionPage() {
  const auth = await requireSignedIn();
  if ("error" in auth) redirect("/login");

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>New competition</h1>
      <CompetitionForm mode="create" />
    </main>
  );
}
