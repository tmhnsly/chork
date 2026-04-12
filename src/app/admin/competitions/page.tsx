import Link from "next/link";
import { redirect } from "next/navigation";
import { FaPlus } from "react-icons/fa6";
import { requireSignedIn } from "@/lib/auth";
import { getCompetitionsForOrganiser } from "@/lib/data/competition-queries";
import { format, parseISO } from "date-fns";
import { SetStatusBadge } from "@/components/admin/SetStatusBadge";
import styles from "./competitions.module.scss";

export const metadata = {
  title: "Competitions - Admin - Chork",
};

/**
 * Admin list of competitions the caller organises. Competition role is
 * decoupled from gym admin — anyone signed in can create a competition,
 * so we gate on `requireSignedIn` rather than `requireGymAdmin`.
 */
export default async function AdminCompetitionsPage() {
  const auth = await requireSignedIn();
  if ("error" in auth) redirect("/login");
  const { supabase, userId } = auth;

  const competitions = await getCompetitionsForOrganiser(supabase, userId);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Competitions</h1>
        <p className={styles.subtitle}>Competitions you organise.</p>
      </header>

      <Link href="/admin/competitions/new" className={styles.newBtn}>
        <FaPlus aria-hidden /> New competition
      </Link>

      {competitions.length === 0 ? (
        <p className={styles.empty}>
          You haven&apos;t organised any competitions yet. Create one to link
          multiple gyms into a single unified leaderboard.
        </p>
      ) : (
        <ul className={styles.list}>
          {competitions.map((c) => (
            <li key={c.id}>
              <Link href={`/admin/competitions/${c.id}`} className={styles.row}>
                <div className={styles.rowText}>
                  <span className={styles.rowTitle}>{c.name}</span>
                  <span className={styles.rowMeta}>
                    {format(parseISO(c.starts_at), "MMM d yyyy")}
                    {c.ends_at && ` – ${format(parseISO(c.ends_at), "MMM d yyyy")}`}
                  </span>
                </div>
                <SetStatusBadge status={c.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
