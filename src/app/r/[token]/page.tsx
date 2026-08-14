import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { format, parseISO } from "date-fns";
import { FaCrown } from "react-icons/fa6";
import { LinkButton } from "@/components/ui";
import { getSharedResult } from "@/lib/data/shared-result";
import styles from "./result.module.scss";

/**
 * Public result page — the landing spot for a shared match link.
 *
 * Deliberately readable with no account: this is the end of the
 * word-of-mouth loop. Someone who wasn't there taps a link in a group
 * chat, sees who won, and finds one obvious way in.
 *
 * It is NOT a hole in summary privacy. The route is keyed by an
 * unguessable token that only exists once a participant has chosen to
 * share (migration 079); summaries nobody shares stay unreachable,
 * and the id-keyed page remains participant-only.
 */

interface Props {
  params: Promise<{ token: string }>;
}

/** Title/description for the unfurl. The image comes from the sibling
 *  `opengraph-image.tsx`, which Next wires up automatically. */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const result = await getSharedResult(token);
  if (!result) return { title: "Result not found - Chork" };

  const winner = result.players.find((p) => p.isWinner);
  const label = result.name?.trim() || "Match result";
  return {
    title: `${label} - Chork`,
    description: winner
      ? `${winner.displayName} won with ${winner.points} points. ${result.playerCount} climbers.`
      : `${result.playerCount} climbers. See the result.`,
    // Nothing here should be indexed — these are private-ish links
    // shared between friends, not public pages we want ranked.
    robots: { index: false, follow: false },
  };
}

export default async function SharedResultPage({ params }: Props) {
  const { token } = await params;
  const result = await getSharedResult(token);
  if (!result) notFound();

  const winner = result.players.find((p) => p.isWinner);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>Match result</p>
        <h1 className={styles.title}>
          {result.name?.trim() || "Match"}
        </h1>
        <p className={styles.meta}>
          {[
            result.location,
            format(parseISO(result.endedAt), "d MMM"),
            `${result.playerCount} ${result.playerCount === 1 ? "climber" : "climbers"}`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </header>

      {winner && (
        <section className={styles.winner} aria-label="Winner">
          <FaCrown className={styles.crown} aria-hidden />
          <p className={styles.winnerName}>{winner.displayName}</p>
          <p className={styles.winnerScore}>{winner.points} pts</p>
        </section>
      )}

      <ol className={styles.list} aria-label="Final standings">
        {result.players.map((p) => (
          <li key={`${p.rank}-${p.username}`} className={styles.row}>
            <span className={styles.rank}>{p.rank}</span>
            <span className={styles.name}>
              {p.displayName}
              <span className={styles.handle}>@{p.username}</span>
            </span>
            <span className={styles.points}>
              {p.points}
              <span className={styles.pointsLabel}>pts</span>
            </span>
          </li>
        ))}
      </ol>

      <section className={styles.cta}>
        <p className={styles.ctaLede}>
          Chork scores your climbing — at a gym, outdoors, anywhere.
        </p>
        <LinkButton href="/login">Start your own match</LinkButton>
      </section>
    </main>
  );
}
