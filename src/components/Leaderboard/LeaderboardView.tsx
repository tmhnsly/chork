"use client";

import { useState, useTransition, useCallback, useRef } from "react";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Button, showToast } from "@/components/ui";
import { Podium } from "./Podium";
import { PodiumSkeleton } from "./PodiumSkeleton";
import { LeaderboardList } from "./LeaderboardList";
import { NeighbourhoodSection } from "./NeighbourhoodSection";
import { EmptyLeaderboard } from "./EmptyLeaderboard";
import { ClimberSheet } from "./ClimberSheet";
import { GymStatsStrip } from "./GymStatsStrip";
import { ScoringBreakdown } from "./ScoringBreakdown";
import { InviteCard } from "./InviteCard";
import { PageHeader } from "@/components/motion";
import type { LeaderboardEntry } from "@/lib/data";
import type { GymStats } from "@/lib/data/queries";
import {
  fetchLeaderboardTab,
  fetchLeaderboardPage,
} from "@/app/leaderboard/actions";
import styles from "./leaderboardView.module.scss";

export interface TabData {
  top: LeaderboardEntry[];
  userRow: LeaderboardEntry | null;
  neighbourhood: LeaderboardEntry[];
}

type Tab = "set" | "all";

const TOP_LIMIT = 5;

interface Props {
  gymName: string;
  currentSetId: string | null;
  currentUserId: string;
  /** Initial data for the "set" tab (pre-fetched by server page). */
  initialSetData: TabData | null;
  /** Aggregate numbers scoped to the current set. Null when no active set. */
  setStats: GymStats | null;
  /** All-time gym-wide aggregate numbers. */
  allTimeStats: GymStats;
}

export function LeaderboardView({
  gymName,
  currentSetId,
  currentUserId,
  initialSetData,
  setStats,
  allTimeStats,
}: Props) {
  const [tab, setTab] = useState<Tab>(currentSetId ? "set" : "all");
  const [cache, setCache] = useState<Partial<Record<Tab, TabData>>>(() =>
    initialSetData ? { set: initialSetData } : {}
  );
  const [sheetEntry, setSheetEntry] = useState<LeaderboardEntry | null>(null);
  const [isPending, startTransition] = useTransition();

  // "See all" lazy pagination
  const [seeAllOpen, setSeeAllOpen] = useState(false);
  const [seeAllRows, setSeeAllRows] = useState<LeaderboardEntry[]>([]);
  const [seeAllExhausted, setSeeAllExhausted] = useState(false);
  const [seeAllLoading, setSeeAllLoading] = useState(false);

  const activeSetIdForTab = tab === "set" ? currentSetId : null;

  // Track which tabs have an in-flight fetch to prevent duplicate requests
  const inFlightTabs = useRef<Set<Tab>>(new Set());

  const handleTabChange = useCallback((next: Tab) => {
    setTab(next);
    // Reset see-all when switching tabs
    setSeeAllOpen(false);
    setSeeAllRows([]);
    setSeeAllExhausted(false);

    if (cache[next] || inFlightTabs.current.has(next)) return;
    inFlightTabs.current.add(next);
    const fetchSetId = next === "set" ? currentSetId : null;
    startTransition(async () => {
      try {
        const result = await fetchLeaderboardTab(fetchSetId);
        if ("error" in result) {
          showToast(result.error, "error");
          return;
        }
        setCache((prev) => ({ ...prev, [next]: result.data }));
      } finally {
        inFlightTabs.current.delete(next);
      }
    });
  }, [cache, currentSetId]);

  const openSheet = useCallback((entry: LeaderboardEntry) => {
    setSheetEntry(entry);
  }, []);

  const loadMore = useCallback(async () => {
    setSeeAllLoading(true);
    // Offset skips the top 5 already rendered in podium + main list.
    const offset = TOP_LIMIT + seeAllRows.length;
    const result = await fetchLeaderboardPage(activeSetIdForTab, offset);
    setSeeAllLoading(false);
    if ("error" in result) {
      showToast(result.error, "error");
      return;
    }
    setSeeAllRows((prev) => [...prev, ...result.rows]);
    if (result.rows.length < result.limit) setSeeAllExhausted(true);
  }, [activeSetIdForTab, seeAllRows.length]);

  const openSeeAll = useCallback(async () => {
    setSeeAllOpen(true);
    await loadMore();
  }, [loadMore]);

  const data = cache[tab];
  const top = data?.top ?? [];
  const userRow = data?.userRow ?? null;
  const neighbourhood = data?.neighbourhood ?? [];

  // "Loading" vs "empty" are only distinguishable by whether we've
  // fetched this tab yet. Without this guard, switching tabs briefly
  // shows the empty state ("Be the first to send") while the fetch
  // is in flight — jarring on tabs that actually have climbers.
  const tabLoading = !data;
  const isEmpty =
    !tabLoading && top.length === 0 && (userRow === null || userRow.rank === null);

  // User in top 5 (rank 1-5 inclusive)
  const userInTop = userRow?.rank != null && userRow.rank <= 5;

  // Top 3 for podium, 4-5 for main list
  const podiumEntries = top.slice(0, 3);
  const mainListEntries = top.slice(3, 5);

  // Dedup: neighbourhood excludes top 5, see-all excludes both top 5 and neighbourhood
  const topIds = new Set(top.map((e) => e.user_id));
  const neighbourhoodDeduped = neighbourhood.filter((e) => !topIds.has(e.user_id));
  const visibleIds = new Set([...topIds, ...neighbourhoodDeduped.map((e) => e.user_id)]);
  const seeAllDeduped = seeAllRows.filter((e) => !visibleIds.has(e.user_id));

  const showNeighbourhood = !userInTop && userRow?.rank != null && neighbourhoodDeduped.length > 0;
  const showUnrankedUser = userRow && userRow.rank === null && !isEmpty;

  return (
    <div className={styles.view}>
      <PageHeader title="Chork Board" />

      <GymStatsStrip
        stats={tab === "set" && setStats ? setStats : allTimeStats}
        gymName={gymName}
      />

      <div className={styles.segmentRow}>
        <SegmentedControl
          options={[
            { value: "set" as const, label: "This set" },
            { value: "all" as const, label: "All time" },
          ]}
          value={tab}
          onChange={handleTabChange}
          ariaLabel="Leaderboard timeframe"
        />
      </div>

      <div className={styles.live} role="status" aria-live="polite">
        {isPending ? "Loading…" : ""}
      </div>

      {tabLoading ? (
        <PodiumSkeleton />
      ) : isEmpty ? (
        <EmptyLeaderboard />
      ) : (
        <>
          {podiumEntries.length > 0 && (
            <Podium top={podiumEntries} currentUserId={currentUserId} onPress={openSheet} />
          )}

          {mainListEntries.length > 0 && (
            <LeaderboardList
              rows={mainListEntries}
              currentUserId={currentUserId}
              onPress={openSheet}
              ariaLabel="Top climbers"
            />
          )}

          {showNeighbourhood && (
            <NeighbourhoodSection
              rows={neighbourhoodDeduped}
              currentUserId={currentUserId}
              onPress={openSheet}
            />
          )}

          {showUnrankedUser && userRow && (
            <section className={styles.unranked}>
              <p className={styles.unrankedHint}>Log a climb to join the board.</p>
              <LeaderboardList
                rows={[userRow]}
                currentUserId={currentUserId}
                onPress={openSheet}
                ariaLabel="Your row"
              />
            </section>
          )}

          {!seeAllOpen && top.length >= 5 && (
            <Button variant="secondary" onClick={openSeeAll} fullWidth>
              See all
            </Button>
          )}

          {seeAllOpen && (
            <section className={styles.seeAll} aria-label="All climbers">
              <LeaderboardList
                rows={seeAllDeduped}
                currentUserId={currentUserId}
                onPress={openSheet}
                ariaLabel="All climbers"
              />
              {!seeAllExhausted && (
                <Button
                  variant="secondary"
                  onClick={loadMore}
                  disabled={seeAllLoading}
                  fullWidth
                >
                  {seeAllLoading ? "Loading…" : "Load more"}
                </Button>
              )}
            </section>
          )}

          <ScoringBreakdown />
          <InviteCard gymName={gymName} />
        </>
      )}

      {sheetEntry && (
        <ClimberSheet
          entry={sheetEntry}
          setId={activeSetIdForTab}
          onClose={() => setSheetEntry(null)}
        />
      )}
    </div>
  );
}
