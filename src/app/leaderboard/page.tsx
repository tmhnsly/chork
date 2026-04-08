import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
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
      <h1 className={styles.title}>Leaderboard</h1>
      <p className={styles.placeholder}>Leaderboard coming soon</p>
    </main>
  );
}
