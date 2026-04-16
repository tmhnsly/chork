"use client";

import { useState, useTransition, useCallback, useRef, useEffect } from "react";
import { getAvatarUrl } from "@/lib/avatar";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { showToast } from "@/components/ui";
import { Podium } from "./Podium";
import { PodiumSkeleton } from "./PodiumSkeleton";
import { LeaderboardList } from "./LeaderboardList";
import { BrowseSection } from "./BrowseSection";
import { EmptyLeaderboard } from "./EmptyLeaderboard";
import dynamic from "next/dynamic";
// Lazy-load the climber sheet — it's only mounted when a row is
// tapped, and pulls in PunchTile / formatGrade / sanitisation
// helpers we'd otherwise pay for on every leaderboard load.
const ClimberSheet = dynamic(
  () => import("./ClimberSheet").then((m) => m.ClimberSheet),
  { ssr: false },
);
import { GymStatsStrip } from "./GymStatsStrip";
import { ScoringBreakdown } from "./ScoringBreakdown";
import { InviteCard } from "./InviteCard";
import { PageHeader } from "@/components/motion";
import type { LeaderboardEntry, Route } from "@/lib/data";
import type { GymStats } from "@/lib/data/queries";
import { fetchLeaderboardTab } from "@/app/leaderboard/actions";
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
  /** Routes for the active set — passed down to ClimberSheet so it
   *  can render the grid shape immediately while logs fetch. */
  currentSetRoutes: Route[];
  /** Pre-formatted reset date for the active set (e.g. "Apr 20").
   *  Null when there is no active set. The gym-stats meta row shows
   *  it only while the "This set" tab is active. */
  currentSetResetDate: string | null;
}

export function LeaderboardView({
  gymName,
  currentSetId,
  currentUserId,
  initialSetData,
  setStats,
  allTimeStats,
  currentSetRoutes,
  currentSetResetDate,
}: Props) {
  const [tab, setTab] = useState<Tab>(currentSetId ? "set" : "all");
  const [cache, setCache] = useState<Partial<Record<Tab, TabData>>>(() =>
    initialSetData ? { set: initialSetData } : {}
  );
  const [sheetEntry, setSheetEntry] = useState<LeaderboardEntry | null>(null);
  const [isPending, startTransition] = useTransition();

  const activeSetIdForTab = tab === "set" ? currentSetId : null;

  // Track which tabs have an in-flight fetch to prevent duplicate requests
  const inFlightTabs = useRef<Set<Tab>>(new Set());

  const handleTabChange = useCallback((next: Tab) => {
    setTab(next);
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

  // Warm the browser image cache for every cached tab's top-3
  // avatars. Without this, flipping from "This set" to "All time"
  // caused visible avatar pop-in — the images for new climbers
  // fetched fresh. Creating an `Image` object triggers a background
  // load that goes straight into cache, so the `<Image>` swap on
  // tab change hits the cache instead of the network.
  useEffect(() => {
    if (typeof window === "undefined") return;
    for (const tabData of Object.values(cache)) {
      for (const entry of tabData?.top.slice(0, 3) ?? []) {
        if (!entry.avatar_url) continue;
        const url = getAvatarUrl(
          {
            id: entry.user_id,
            avatar_url: entry.avatar_url,
            name: entry.name,
            username: entry.username,
          },
          { size: 176 },
        );
        if (url) {
          const img = new window.Image();
          img.src = url;
        }
      }
    }
  }, [cache]);

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

  // Dedup neighbourhood vs top so the BrowseSection's initial window
  // doesn't repeat top-5 entries already shown in the podium / main list.
  const topIds = new Set(top.map((e) => e.user_id));
  const neighbourhoodDeduped = neighbourhood.filter((e) => !topIds.has(e.user_id));

  const showBrowse = !userInTop && userRow?.rank != null;
  const showUnrankedUser = userRow && userRow.rank === null && !isEmpty;

  return (
    <div className={styles.view}>
      <PageHeader title="Chork Board" />

      <GymStatsStrip
        stats={tab === "set" && setStats ? setStats : allTimeStats}
        gymName={gymName}
        resetDate={tab === "set" ? currentSetResetDate : null}
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
            <Podium
              top={podiumEntries}
              currentUserId={currentUserId}
              onPress={openSheet}
              activeUserId={sheetEntry?.user_id ?? null}
            />
          )}

          {mainListEntries.length > 0 && (
            <LeaderboardList
              rows={mainListEntries}
              currentUserId={currentUserId}
              onPress={openSheet}
              ariaLabel="Top climbers"
            />
          )}

          {showBrowse && userRow?.rank != null && (
            <BrowseSection
              key={`browse:${tab}:${activeSetIdForTab ?? "all"}`}
              initialRows={neighbourhoodDeduped}
              userRank={userRow.rank}
              setId={activeSetIdForTab}
              currentUserId={currentUserId}
              onPress={openSheet}
            />
          )}

          {/* Top-5 climbers can also page the rest of the board. */}
          {userInTop && top.length >= TOP_LIMIT && (
            <BrowseSection
              key={`browse-top:${tab}:${activeSetIdForTab ?? "all"}`}
              initialRows={[]}
              userRank={userRow?.rank ?? 0}
              setId={activeSetIdForTab}
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

          <ScoringBreakdown />
          <InviteCard gymName={gymName} />
        </>
      )}

      {sheetEntry && (
        <ClimberSheet
          entry={sheetEntry}
          setId={activeSetIdForTab}
          routes={currentSetRoutes}
          onClose={() => setSheetEntry(null)}
        />
      )}
    </div>
  );
}
