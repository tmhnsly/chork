import { redirect } from "next/navigation";
import { requireSignedIn } from "@/lib/auth";
import { getUserSavedScales } from "@/lib/data/match-queries";
import { PageHeader } from "@/components/motion";
import { CreateMatchForm } from "@/components/Match/CreateMatchForm";
import styles from "./new.module.scss";

export const metadata = {
  title: "Start a match",
};

export default async function NewMatchPage() {
  const auth = await requireSignedIn();
  if ("error" in auth) redirect("/login");

  const savedScales = await getUserSavedScales(auth.supabase);

  return (
    <main className={styles.page}>
      <PageHeader
        title="Start a match"
        subtitle="Set up a quick comp you can run anywhere."
      />
      <CreateMatchForm savedScales={savedScales} />
    </main>
  );
}
