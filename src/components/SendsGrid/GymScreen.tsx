"use client";

import { useCallback, useState } from "react";
import { useDebouncedFlush } from "@/hooks/use-debounced-flush";
import { fetchMyRank, type MyRank } from "@/app/(app)/rank-actions";
import type { RouteSet, Route, RouteLog } from "@/lib/data/types";
import { RankStrip } from "./RankStrip";
import { SendsGrid } from "./SendsGrid";

interface Props {
  set: RouteSet;
  routes: Route[];
  initialLogs: RouteLog[];
  gymName: string | null;
  initialRank: MyRank;
}

/**
 * Your card, with your standing above it.
 *
 * Card and Ranks used to be two nav tabs. They are one context — "my
 * gym, right now" — and behind separate tabs the connection between
 * them was invisible: you logged a send and nothing on screen said it
 * mattered. The strip is that sentence, made visible.
 *
 * This component exists only to hold the wire between the two. The
 * grid owns logging, the strip owns display, and the single piece of
 * shared knowledge — "a log changed, go and ask where I am now" —
 * lives here rather than being threaded through either of them.
 *
 * Rank can't be computed on the client: it depends on everyone else's
 * sends. And `completeRoute` busts cache tags rather than re-rendering
 * this page, so the server props don't move either. Hence the ask.
 */
export function GymScreen({
  set,
  routes,
  initialLogs,
  gymName,
  initialRank,
}: Props) {
  const [rank, setRank] = useState(initialRank);
  // The rank this screen opened on. Everything gained is measured
  // against it, so the badge reads "since you got here" rather than
  // "since the last tap" — which is the span a climber actually has
  // in their head.
  const [openedAt] = useState(initialRank.rank);

  // Debounced because working a route is a burst: attempts, a zone,
  // then the send. Asking after each would be three round-trips for
  // one piece of news. `useDebouncedFlush` also flushes on unmount, so
  // navigating away mid-burst doesn't drop the last one.
  const { schedule } = useDebouncedFlush<void>({
    delayMs: 1200,
    flush: async () => {
      const next = await fetchMyRank();
      if (next) setRank(next);
    },
  });

  const handleLogChange = useCallback(() => schedule(undefined), [schedule]);

  const gained =
    openedAt !== null && rank.rank !== null && openedAt > rank.rank
      ? openedAt - rank.rank
      : null;

  return (
    <>
      <RankStrip rank={rank} gained={gained} />
      <SendsGrid
        set={set}
        routes={routes}
        initialLogs={initialLogs}
        gymName={gymName}
        onLogChange={handleLogChange}
      />
    </>
  );
}
