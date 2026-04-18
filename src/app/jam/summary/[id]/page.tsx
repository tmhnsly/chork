import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { FaCrown, FaArrowLeft } from "react-icons/fa6";
import { requireSignedIn } from "@/lib/auth";
import { createServerSupabase, createServiceClient } from "@/lib/supabase/server";
import { getJamSummaryForUser } from "@/lib/data/jam-queries";
import { PageHeader } from "@/components/motion";
import { UserAvatar } from "@/components/ui";
import styles from "./summary.module.scss";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ fresh?: string }>;
}

export default async function JamSummaryPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { fresh } = await searchParams;
  const auth = await requireSignedIn();
  if ("error" in auth) redirect("/login");

  // Access control: only the host + players who participated can
  // view a jam summary. Migration 052 RLS already restricts DIRECT
  // table access to host + participants, but the hydrator below
  // bypasses RLS (service_role), so we re-enforce the check at the
  // page boundary via two RLS-respecting reads. 404 for
  // non-participants so URL-guess enumeration doesn't leak jam
  // existence (host identity, location, roster, points were all
  // previously readable by any authed user with the URL).
  const supabaseAnon = await createServerSupabase();
  const [{ data: asPlayer }, { data: asHost }] = await Promise.all([
    supabaseAnon
      .from("jam_summary_players")
      .select("user_id")
      .eq("jam_summary_id", id)
      .eq("user_id", auth.userId)
      .maybeSingle(),
    supabaseAnon
      .from("jam_summaries")
      .select("host_id")
      .eq("id", id)
      .eq("host_id", auth.userId)
      .maybeSingle(),
  ]);
  if (!asPlayer && !asHost) notFound();

  // Service-role hydrator — takes the caller's user id explicitly
  // so the attempts-privacy mask inside the RPC doesn't rely on
  // `auth.uid()` (which flakes on SSR under a stale JWT and would
  // otherwise silently zero the caller's OWN attempt count).
  const service = createServiceClient();
  const bundle = await getJamSummaryForUser(service, id, auth.userId);
  if (!bundle) notFound();
  const { summary, players } = bundle;

  const winner = players.find((p) => p.is_winner);

  return (
    <main className={styles.page}>
      <div className={styles.topRow}>
        <Link href="/jam" className={styles.backLink}>
          <FaArrowLeft aria-hidden /> Jams
        </Link>
        {fresh && (
          <span className={styles.freshBadge}>Jam complete</span>
        )}
      </div>

      <PageHeader
        title={summary.name?.trim() || "Untitled jam"}
        subtitle={[
          summary.location,
          format(parseISO(summary.ended_at), "d MMM yyyy"),
          formatDuration(summary.duration_seconds),
        ]
          .filter(Boolean)
          .join(" · ")}
      />

      {winner && (
        <section className={styles.winnerCard}>
          <FaCrown aria-hidden className={styles.winnerIcon} />
          <div className={styles.winnerBody}>
            <span className={styles.winnerEyebrow}>Winner</span>
            <span className={styles.winnerName}>
              {winner.display_name || winner.username}
            </span>
            {winner.display_name && winner.username && (
              <span className={styles.winnerHandle}>
                @{winner.username}
              </span>
            )}
          </div>
          <div className={styles.winnerStats}>
            <span className={styles.winnerPoints}>{winner.points}</span>
            <span className={styles.winnerPointsLabel}>points</span>
          </div>
        </section>
      )}

      <section className={styles.boardSection} aria-labelledby="final-board">
        <h2 id="final-board" className={styles.sectionHeading}>
          Final board
        </h2>
        <ol className={styles.playerList}>
          {players.map((p, i) => (
            <li
              key={p.user_id ?? `deleted-${p.rank}-${i}`}
              className={styles.playerRow}
            >
              <span className={styles.playerRank}>#{p.rank}</span>
              <UserAvatar
                user={{
                  id: p.user_id ?? "",
                  username: p.username,
                  name: p.display_name,
                  avatar_url: p.avatar_url ?? "",
                }}
                size={36}
              />
              <div className={styles.playerIdentity}>
                <span className={styles.playerName}>
                  {p.display_name || p.username}
                </span>
                <span className={styles.playerHandle}>@{p.username}</span>
              </div>
              <div className={styles.playerStats}>
                <span>{p.sends} sends</span>
                <span>{p.flashes} flashes</span>
                <span className={styles.playerPoints}>{p.points} pts</span>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.round((seconds % 3600) / 60);
  if (hours === 0) return `${mins} min`;
  if (mins === 0) return `${hours} hr`;
  return `${hours} hr ${mins} min`;
}
