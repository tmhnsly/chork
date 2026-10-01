import { redirect } from "next/navigation";
import { requireSignedIn } from "@/lib/auth";
import { PageHeader } from "@/components/motion";
import { GamePosters } from "@/components/Match/GamePosters";
import styles from "./new.module.scss";

export const metadata = { title: "Start a game" };

export default async function NewMatchPage() {
  const auth = await requireSignedIn();
  if ("error" in auth) redirect("/login");

  return (
    <main className={styles.page}>
      <PageHeader
        title="Start a game"
        subtitle="Pick a game, then name it and choose what you're climbing."
      />
      <GamePosters />
    </main>
  );
}
