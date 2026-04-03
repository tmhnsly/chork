import { redirect } from "next/navigation";
import { createServerPBFromCookies } from "@/lib/pocketbase-server";
import { getAuthUser } from "@/lib/pocketbase-shared";
import styles from "./leaderboard.module.scss";

export const metadata = {
  title: "Leaderboard — Chork",
};

export default async function LeaderboardPage() {
  const pb = await createServerPBFromCookies();
  const user = getAuthUser(pb);

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
