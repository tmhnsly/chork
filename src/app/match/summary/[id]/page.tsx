import type { Metadata } from "next";
import { seatAvatarUser, seatName } from "@/lib/data/seat";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { FaCrown, FaArrowLeft } from "react-icons/fa6";
import { requireSignedIn } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { getMatchStateForUser, getChorkStandings } from "@/lib/data/match-queries";
import { getLeague, getMyLeagues } from "@/lib/data/league-queries";
import { ChorkWord } from "@/components/Match/ChorkWord";
import { PageHeader } from "@/components/motion";
import { UserAvatar, Username } from "@/components/ui";
import { ShareResultButton } from "@/components/Match/ShareResultButton";
import { FixtureControls } from "@/components/League/FixtureControls";
import { weekLabel } from "@/lib/data/league";
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

  // Fixture controls for the host; a "week n of" line for everyone
  // once the Match is in a League. `getMyLeagues` takes the caller's
  // client — the RPC reads `auth.uid()`.
  const isHost = summary.host_id === auth.userId;
  const inLeague = summary.league_id
    ? await getLeague(auth.supabase, summary.league_id)
    : null;
  const hostLeagues = isHost && !summary.league_id
    ? (await getMyLeagues(auth.supabase)).filter((l) => l.is_host && l.ended_at === null)
    : [];
  // `weekLabel` wants position among archived weeks only — reuse the
  // same tested arithmetic `LeagueWeekList` uses rather than
  // re-deriving it here.
  const archivedWeeks = inLeague?.weeks.filter((w) => w.status === "archived") ?? [];
  // Can't actually miss — only an archived Match ever carries a
  // `league_id` (RPC-enforced) — but guard anyway so a bad row hides
  // the line rather than printing a wrong week number.
  const thisWeekIndex = archivedWeeks.findIndex((w) => w.set_id === id);

  // Chork has no points, so it cannot have a points board or a
  // points winner. Ending one used to crown whoever happened to send
  // the most and print "12 points" underneath, on a game whose whole
  // rule is that you lose by spelling a word.
  const isChork = summary.game_mode === "chork";
  const chork = isChork ? await getChorkStandings(service, id) : [];
  // Fewest letters among those still standing. A tie shares it, the
  // same way rank 1 does on the points board — and when the game runs
  // to its end there is exactly one climber left, which is the win
  // condition stated properly.
  const chorkAlive = chork.filter((p) => !p.is_out);
  const fewestLetters = chorkAlive.length
    ? Math.min(...chorkAlive.map((p) => p.letters))
    : null;
  const chorkWinners =
    fewestLetters === null
      ? []
      : chorkAlive.filter((p) => p.letters === fewestLetters);

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

      {inLeague && thisWeekIndex !== -1 && (
        <Link href={`/match/league/${inLeague.league.id}`} className={styles.leagueLine}>
          {weekLabel(archivedWeeks[thisWeekIndex], thisWeekIndex, archivedWeeks.length)} of{" "}
          <strong>{inLeague.league.name}</strong> — see the table
        </Link>
      )}
      {isHost && !summary.league_id && (
        <FixtureControls
          setId={id}
          matchName={summary.name?.trim() || "Tuesday league"}
          leagues={hostLeagues}
        />
      )}

      {isChork && chorkWinners.length > 0 && (
        <section
          className={`${styles.winnerCard} ${fresh ? styles.winnerCardFresh : ""}`}
        >
          <FaCrown aria-hidden className={styles.winnerIcon} />
          <div className={styles.winnerBody}>
            <span className={styles.winnerEyebrow}>
              {chorkWinners.length > 1 ? "Still standing" : "Winner"}
            </span>
            <span className={styles.winnerName}>
              {chorkWinners
                .map((w) => seatName(w))
                .join(", ")}
            </span>
          </div>
          <div className={styles.winnerStats}>
            <ChorkWord letters={chorkWinners[0].letters} />
          </div>
        </section>
      )}

      {!isChork && winner && (
        <section
          className={`${styles.winnerCard} ${fresh ? styles.winnerCardFresh : ""}`}
        >
          <FaCrown aria-hidden className={styles.winnerIcon} />
          <div className={styles.winnerBody}>
            <span className={styles.winnerEyebrow}>Winner</span>
            <span className={styles.winnerName}>
              {seatName(winner)}
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
        {isChork ? (
          <ol className={styles.playerList}>
            {chork.map((p, i) => {
              const username = p.username ?? "unknown";
              return (
                <li key={p.player_id} className={styles.playerRow}>
                  <span className={styles.playerRank}>#{i + 1}</span>
                  <UserAvatar user={seatAvatarUser(p)} size="row" />
                  <div className={styles.playerIdentity}>
                    <span className={styles.playerName}>
                      {seatName(p)}
                    </span>
                    <span className={styles.playerHandle}>
                      {p.is_guest ? "Guest" : <Username username={username} />}
                      {p.is_out && <span className={styles.playerLeft}>Out</span>}
                      {p.has_left && <span className={styles.playerLeft}>Left</span>}
                    </span>
                  </div>
                  <div className={styles.playerStats}>
                    <ChorkWord letters={p.letters} />
                  </div>
                </li>
              );
            })}
          </ol>
        ) : (
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
              key={p.player_id}
              className={styles.playerRow}
            >
              <span className={styles.playerRank}>#{p.rank}</span>
              <UserAvatar user={seatAvatarUser(p)} size="row" />
              <div className={styles.playerIdentity}>
                <span className={styles.playerName}>
                  {seatName(p)}
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
        )}
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
