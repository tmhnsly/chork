import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { FaCrown, FaArrowLeft } from "react-icons/fa6";
import { requireSignedIn } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { getMatchStateForUser } from "@/lib/data/match-queries";
import { PageHeader } from "@/components/motion";
import { UserAvatar, Username } from "@/components/ui";
import { ShareResultButton } from "@/components/Match/ShareResultButton";
import styles from "./summary.module.scss";
import { formatHandicapPoints } from "@/lib/data/handicap";
import { countOf, countOfFormatted } from "@/lib/plural";
import { isUuid } from "@/lib/validation";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ fresh?: string }>;
}

/**
 * The Match's own name in the tab — this is the page a climber has
 * open when they hand someone their phone. The layout appends
 * "· Chork"; see `src/app/metadata.test.ts`.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  if (!isUuid(id)) return { title: "Match result" };
  const auth = await requireSignedIn();
  if ("error" in auth) return { title: "Match result" };
  const state = await getMatchStateForUser(createServiceClient(), id, auth.userId);
  return { title: state?.match.name?.trim() || "Match result" };
}

export default async function MatchSummaryPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { fresh } = await searchParams;
  const auth = await requireSignedIn();
  if ("error" in auth) redirect("/login");

  // `id` is the SET id. Since the convergence there is no summary to
  // address separately: a finished Match is an archived Set, and this
  // page reads the very rows the live board read. That is what keeps
  // a tied result ranked the same here as it was a second earlier —
  // the old `end_match` wrote summary ranks with `row_number()` while
  // the board used `dense_rank()`, so the two could disagree.
  //
  // Service-role hydrator — gates on participation internally using
  // the explicit `p_user_id`. A null return means "not found OR
  // caller was never a player"; both collapse to 404 so URL-guess
  // enumeration can't distinguish the two.
  //
  // The gate used to live here as two anon pre-flight RLS queries,
  // but both relied on `auth.uid()` flowing through the user's JWT
  // — which transiently resolves NULL on the SSR fetch that fires
  // immediately after ending and `router.push` runs. That was the
  // reliable "ending a match 404s" root cause: the gate failed on the
  // very request it was meant to pass. Keep it in the RPC.
  const service = createServiceClient();
  const state = await getMatchStateForUser(service, id, auth.userId);
  if (!state) notFound();
  const summary = state.match;
  const players = state.leaderboard;

  // Rank 1 IS the win, and dense_rank means a tie shares it — so a
  // drawn Match shows both winners rather than picking one.
  const winner = players.find((p) => p.rank === 1);
  const endedAt = summary.ends_at;
  const durationSeconds = endedAt
    ? Math.max(
        0,
        Math.round(
          (parseISO(endedAt).getTime() - parseISO(summary.starts_at).getTime())
            / 1000,
        ),
      )
    : 0;

  return (
    <main className={styles.page}>
      <div className={styles.topRow}>
        <Link href="/match" className={styles.backLink}>
          <FaArrowLeft aria-hidden /> Matches
        </Link>
        {fresh && (
          <span className={styles.freshBadge}>Match complete</span>
        )}
      </div>

      <PageHeader
        title={summary.name?.trim() || "Untitled match"}
        subtitle={[
          summary.location,
          endedAt ? format(parseISO(endedAt), "d MMM yyyy") : null,
          formatDuration(durationSeconds),
        ]
          .filter(Boolean)
          .join(" · ")}
      />

      {/* Straight after the header, above the board: the moment a
          result lands is when someone wants to send it, and burying
          the share below the standings loses that impulse. */}
      <ShareResultButton
        summaryId={id}
        label={summary.name?.trim() || "Match"}
      />

      {winner && (
        <section
          className={`${styles.winnerCard} ${fresh ? styles.winnerCardFresh : ""}`}
        >
          <FaCrown aria-hidden className={styles.winnerIcon} />
          <div className={styles.winnerBody}>
            <span className={styles.winnerEyebrow}>Winner</span>
            <span className={styles.winnerName}>
              {winner.display_name || winner.username}
            </span>
            {winner.display_name && winner.username && (
              <Username
                username={winner.username}
                className={styles.winnerHandle}
              />
            )}
          </div>
          <div className={styles.winnerStats}>
            <span className={styles.winnerPoints}>{formatHandicapPoints(winner.points_tenths)}</span>
            <span className={styles.winnerPointsLabel}>points</span>
          </div>
        </section>
      )}

      <section className={styles.boardSection} aria-labelledby="final-board">
        <h2 id="final-board" className={styles.sectionHeading}>
          Final board
        </h2>
        <ol className={styles.playerList}>
          {players.map((p, i) => {
            // The old summary denormalised names at end time, so a
            // deleted account kept its label. Reading live rows means
            // the join can miss — show the placeholder rather than an
            // empty row, so the standings stay complete.
            const username = p.username ?? "unknown";
            // A guest has no account, so no handle to show. "@unknown"
            // under someone's name reads as a bug to everyone and as
            // rudeness to them.
            const isGuest = p.is_guest;
            return (
            <li
              key={p.user_id || `unknown-${p.rank}-${i}`}
              className={styles.playerRow}
            >
              <span className={styles.playerRank}>#{p.rank}</span>
              <UserAvatar
                user={{
                  id: p.user_id ?? "",
                  username,
                  // Falls back to the handle so the avatar still gets
                  // an initial to draw, matching the name shown below.
                  name: p.display_name ?? username,
                  avatar_url: p.avatar_url ?? "",
                }}
                size="row"
              />
              <div className={styles.playerIdentity}>
                <span className={styles.playerName}>
                  {p.display_name || (isGuest ? "Guest" : username)}
                </span>
                <span className={styles.playerHandle}>
                  {isGuest ? (
                    "Guest"
                  ) : (
                    <Username username={username} />
                  )}
                  {p.has_left && <span className={styles.playerLeft}>Left</span>}
                </span>
              </div>
              <div className={styles.playerStats}>
                <span>{countOf(p.sends, "send")}</span>
                <span>{countOf(p.flashes, "flash", "flashes")}</span>
                <span className={styles.playerPoints}>
                  {countOfFormatted(formatHandicapPoints(p.points_tenths), "pt")}
                </span>
              </div>
            </li>
            );
          })}
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
