import { redirect } from "next/navigation";
import { requireSignedIn } from "@/lib/auth";
import { getUserSavedScales } from "@/lib/data/jam-queries";
import { PageHeader } from "@/components/motion";
import { CreateJamForm } from "@/components/Jam/CreateJamForm";
import styles from "./new.module.scss";

export const metadata = {
  title: "Start a jam - Chork",
};

export default async function NewJamPage() {
  const auth = await requireSignedIn();
  if ("error" in auth) redirect("/login");

  const savedScales = await getUserSavedScales(auth.supabase);

  return (
    <main className={styles.page}>
      <PageHeader
        title="Start a jam"
        subtitle="Set up a quick comp you can run anywhere."
      />
      <CreateJamForm savedScales={savedScales} />
    </main>
  );
}
