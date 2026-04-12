"use client";

import { useState } from "react";
import { FaBolt, FaBullseye, FaCheck } from "react-icons/fa6";
import { UserAvatar } from "@/components/ui";
import { createBrowserSupabase } from "@/lib/supabase/client";
import {
  getCrewActivityFeed,
  type CrewActivityEvent,
} from "@/lib/data/crew-queries";
import { formatSetLabel } from "@/lib/data/set-label";
import { relativeDay } from "@/lib/data/crew-time";
import styles from "./crewActivityFeed.module.scss";

const PAGE_SIZE = 30;

interface Props {
  hasCrew: boolean;
  /** First page of feed events, rendered server-side for instant paint. */
  initialEvents: CrewActivityEvent[];
  /** True when the first page returned fewer than PAGE_SIZE rows. */
  initialExhausted: boolean;
}

/**
 * Chronological feed of crew-mate achievements. First page ships from
 * the server so the tab opens fully populated; subsequent pages load
 * lazily via the get_crew_activity_feed RPC with an updated_at cursor.
 *
 * Timestamps are coarse relative-time only — see `relativeDay` in
 * src/lib/data/crew-time.ts for the privacy contract.
 */
export function CrewActivityFeed({
  hasCrew,
  initialEvents,
  initialExhausted,
}: Props) {
  const [events, setEvents] = useState<CrewActivityEvent[]>(initialEvents);
  const [cursor, setCursor] = useState<string | null>(
    initialEvents.length > 0 ? initialEvents[initialEvents.length - 1].happened_at : null
  );
  const [exhausted, setExhausted] = useState<boolean>(initialExhausted);
  const [loadingMore, setLoadingMore] = useState(false);

  async function handleLoadMore() {
    if (!cursor || loadingMore || exhausted) return;
    setLoadingMore(true);
    const supabase = createBrowserSupabase();
    const page = await getCrewActivityFeed(supabase, PAGE_SIZE, cursor);
    setEvents((prev) => [...prev, ...page]);
    if (page.length < PAGE_SIZE) setExhausted(true);
    else setCursor(page[page.length - 1].happened_at);
    setLoadingMore(false);
  }

  if (events.length === 0) {
    return (
      <p className={styles.empty}>
        {hasCrew
          ? "No crew activity yet. Your mates' sends will show up here."
          : "Create a crew and invite your climbing mates — their sends will appear here."}
      </p>
    );
  }

  return (
    <>
      <ul className={styles.list}>
        {events.map((e) => (
          <FeedRow key={e.route_log_id} event={e} />
        ))}
      </ul>
      {!exhausted && (
        <button
          type="button"
          className={styles.loadMore}
          onClick={handleLoadMore}
          disabled={loadingMore}
        >
          {loadingMore ? "Loading…" : "Show more"}
        </button>
      )}
    </>
  );
}

// ── Individual row ──────────────────────────────────
function FeedRow({ event }: { event: CrewActivityEvent }) {
  const achievement = event.is_flash ? "flash" : event.is_zone ? "zone" : "send";

  const badge = (() => {
    if (achievement === "flash") {
      return (
        <span className={`${styles.badge} ${styles.badgeFlash}`}>
          <FaBolt aria-hidden /> Flashed
        </span>
      );
    }
    if (achievement === "zone") {
      return (
        <span className={`${styles.badge} ${styles.badgeZone}`}>
          <FaBullseye aria-hidden /> Got the zone
        </span>
      );
    }
    return (
      <span className={`${styles.badge} ${styles.badgeSend}`}>
        <FaCheck aria-hidden /> Sent
      </span>
    );
  })();

  const setLabel = formatSetLabel({
    name: event.set_name,
    starts_at: event.set_starts_at,
    ends_at: event.set_ends_at,
  });

  return (
    <li className={styles.row}>
      <UserAvatar
        user={{
          id: event.user_id,
          username: event.username,
          name: "",
          avatar_url: event.avatar_url,
        }}
        size={36}
      />
      <div className={styles.rowText}>
        <div className={styles.line1}>
          <span className={styles.handle}>@{event.username}</span>
          {badge}
        </div>
        <div className={styles.line2}>
          <span>route {event.route_number}</span>
          <span className={styles.dot}>·</span>
          <span>{event.gym_name}</span>
          <span className={styles.dot}>·</span>
          <span>{setLabel}</span>
        </div>
        <div className={styles.line3}>{relativeDay(event.happened_at)}</div>
      </div>
    </li>
  );
}
