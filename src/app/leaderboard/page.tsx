import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { PageTitle } from "@/components/motion";
import styles from "./leaderboard.module.scss";

export const metadata = {
  title: "Leaderboard — Chork",
};

export default async function LeaderboardPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <main className={styles.page}>
      <PageTitle text="The Board" className={styles.title} />
      <p className={styles.placeholder}>Coming soon</p>
    </main>
  );
}
