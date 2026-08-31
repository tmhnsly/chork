import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { FaArrowLeft, FaPlus } from "react-icons/fa6";
import { requireSignedIn } from "@/lib/auth";
import { getLeague, getLeagueStandings } from "@/lib/data/league-queries";
import { isUuid } from "@/lib/validation";
import { PageHeader } from "@/components/motion";
import { LinkButton } from "@/components/ui";
import { LeagueTable } from "@/components/League/LeagueTable";
import { LeagueWeekList } from "@/components/League/LeagueWeekList";
import { LeagueHostMenu } from "@/components/League/LeagueHostMenu";
import { countOf } from "@/lib/plural";
import styles from "./league.module.scss";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  if (!isUuid(id)) return { title: "League" };
  const auth = await requireSignedIn();
  if ("error" in auth) return { title: "League" };
  const view = await getLeague(auth.supabase, id);
  return { title: view?.league.name ?? "League" };
}

export default async function LeaguePage({ params }: Props) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const auth = await requireSignedIn();
  if ("error" in auth) redirect("/login");

  // Both RPCs gate on the caller — host or seated in a week — so
  // they take the caller's client. Null collapses "no such league"
  // and "not yours" into one 404, so an id can't be probed.
  const [view, standings] = await Promise.all([
    getLeague(auth.supabase, id),
    getLeagueStandings(auth.supabase, id),
  ]);
  if (!view) notFound();

  const { league, weeks, is_host: isHost } = view;
  const archived = weeks.filter((w) => w.status === "archived").length;
  const live = weeks.find((w) => w.status === "live");
  const running = league.ended_at === null;

  return (
    <main className={styles.page}>
      <div className={styles.topRow}>
        <Link href="/match" className={styles.backLink}>
          <FaArrowLeft aria-hidden /> Matches
        </Link>
        {isHost && <LeagueHostMenu league={league} />}
      </div>

      <PageHeader
        title={league.name}
        subtitle={[
          countOf(archived, "week"),
          running ? null : "Ended",
        ]
          .filter(Boolean)
          .join(" · ")}
      />

      {isHost && running && !live && (
        <LinkButton href={`/match/new?league=${league.id}`} fullWidth>
          <FaPlus aria-hidden /> Start this week&apos;s match
        </LinkButton>
      )}
      {live && (
        <LinkButton href={`/match/${live.set_id}`} fullWidth variant="secondary">
          This week is in progress — open it
        </LinkButton>
      )}

      <section className={styles.section} aria-labelledby="league-table">
        <h2 id="league-table" className={styles.heading}>Table</h2>
        <LeagueTable standings={standings} weekCount={archived} viewerId={auth.userId} />
      </section>

      <section className={styles.section} aria-labelledby="league-weeks">
        <h2 id="league-weeks" className={styles.heading}>Weeks</h2>
        {weeks.length === 0 ? (
          <p className={styles.empty}>No weeks yet.</p>
        ) : (
          <LeagueWeekList leagueId={league.id} weeks={weeks} canRemove={isHost && running} />
        )}
      </section>
    </main>
  );
}
