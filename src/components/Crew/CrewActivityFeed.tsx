"use client";

import { useEffect, useState } from "react";
import { FaBolt, FaBullseye, FaCheck } from "react-icons/fa6";
import { UserAvatar, shimmerStyles } from "@/components/ui";
import { createBrowserSupabase } from "@/lib/supabase/client";
import {
  getCrewActivityFeed,
  type CrewActivityEvent,
} from "@/lib/data/crew-queries";
import { formatSetLabel } from "@/lib/data/set-label";
import styles from "./crewActivityFeed.module.scss";

const PAGE_SIZE = 30;

interface Props {
  hasCrew: boolean;
}

/**
 * Chronological feed of crew-mate achievements. Cursor paginates by
 * the server-side RPC; timestamps are coarse relative-time only
 * ("today", "yesterday", "3 days ago") — deliberate privacy choice
 * so climbers can't infer when others are physically at the gym.
 */
export function CrewActivityFeed({ hasCrew }: Props) {
  // Lazy-init based on hasCrew. Users with no crews never hit the
  // fetch path — no setState inside the effect, which would trip
  // Next 15's react-hooks/set-state-in-effect rule.
  const [events, setEvents] = useState<CrewActivityEvent[] | null>(
    () => (hasCrew ? null : [])
  );
  const [cursor, setCursor] = useState<string | null>(null);
  const [exhausted, setExhausted] = useState<boolean>(() => !hasCrew);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    if (!hasCrew) return;
    let cancelled = false;
    (async () => {
      const supabase = createBrowserSupabase();
      const page = await getCrewActivityFeed(supabase, PAGE_SIZE);
      if (cancelled) return;
      setEvents(page);
      if (page.length < PAGE_SIZE) setExhausted(true);
      else setCursor(page[page.length - 1].happened_at);
    })();
    return () => { cancelled = true; };
  }, [hasCrew]);

  async function handleLoadMore() {
    if (!cursor || loadingMore || exhausted) return;
    setLoadingMore(true);
    const supabase = createBrowserSupabase();
    const page = await getCrewActivityFeed(supabase, PAGE_SIZE, cursor);
    setEvents((prev) => [...(prev ?? []), ...page]);
    if (page.length < PAGE_SIZE) setExhausted(true);
    else setCursor(page[page.length - 1].happened_at);
    setLoadingMore(false);
  }

  if (events === null) {
    return (
      <ul className={styles.list} aria-busy="true">
        {[0, 1, 2].map((i) => (
          <li key={i} className={`${styles.row} ${shimmerStyles.skeleton}`} />
        ))}
      </ul>
    );
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

/**
 * Coarse relative time. Always rounded to a whole day — never shows
 * clock time or "X hours ago" so climbers can't infer when crewmates
 * are physically at the gym. Privacy-first by design.
 */
function relativeDay(iso: string): string {
  const then = new Date(iso);
  const now = new Date();
  const thenDay = Date.UTC(then.getUTCFullYear(), then.getUTCMonth(), then.getUTCDate());
  const nowDay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const diffDays = Math.round((nowDay - thenDay) / (24 * 60 * 60 * 1000));
  if (diffDays <= 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays <= 30) return `${diffDays} days ago`;
  return "over a month ago";
}
