"use client";

import { useEffect, useRef } from "react";
import { createBrowserSupabase } from "@/lib/supabase/client";
import type { Match, MatchLog, MatchRoute } from "@/lib/data/match-types";

/**
 * Shape of a Supabase postgres_changes payload for a Match table. The
 * cast from the wire's `unknown` happens ONCE, in this module — the
 * caller receives typed events instead of re-deriving the shape at
 * every handler (MatchScreen used to hand-write this cast twice).
 *
 * A union on `eventType`, so a handler narrows before it reads either
 * side. On DELETE, `new` is an empty object and `old` carries ONLY the
 * row's `id`. `routes`, `route_logs` and `set_players` run REPLICA
 * IDENTITY FULL (migration 085), which is what lets the `set_id` filter
 * apply to deletes at all, but the payload is still just the key:
 * checked against production with throwaway accounts on 2026-09-15.
 * Typed that way, reading any other field from a DELETE is a compile
 * error. On INSERT/UPDATE, `old` may be partial.
 */
export type MatchRealtimeEvent<T> =
  | { eventType: "INSERT" | "UPDATE"; new: T; old: Partial<T> }
  | { eventType: "DELETE"; new: Record<never, never>; old: { id: string } };

/** Something that happened in the room, or to the feed itself. */
export type MatchEvent =
  | { kind: "route"; evt: MatchRealtimeEvent<MatchRoute> }
  | { kind: "log"; evt: MatchRealtimeEvent<MatchLog> }
  /**
   * A `set_players` row. It has no name or face, only the seat, so a
   * join or leave is answered with a refresh, not a patch.
   */
  | { kind: "seat"; evt: MatchRealtimeEvent<{ id: string }> }
  /**
   * The Match's own `sets` row: the host ending it (the only status
   * transition a live screen can see) or changing its setup. An UPDATE
   * carries the whole row (`sets` keeps the default replica identity,
   * which limits only what `old` holds). It also fires on every route
   * and log, because a trigger bumps `last_activity_at`.
   */
  | { kind: "match"; evt: MatchRealtimeEvent<Match> }
  /**
   * The feed may have missed events. Realtime never replays what it
   * sent while a socket was down, and a phone at the wall locks
   * between every climb. A missed log healed itself, because the next
   * one refetched the board, but a missed route stayed missing until a
   * reload: scores moved while the grid didn't. Emitted when the
   * channel joins again after a drop, and when the page comes back
   * into view, since a suspended socket can take a while to notice it
   * died. Events between the page returning and the rejoin are lost
   * too, so both are needed.
   */
  | { kind: "resume" };

/**
 * Subscribes to one Match's live tables (`routes`, `route_logs`,
 * `set_players`, and its own `sets` row) and reports everything as a
 * `MatchEvent`. What an event means is not decided here: see
 * `planEvent` in `matchScreenPlan.ts`.
 *
 * Cleanup on unmount is mandatory to avoid memory leaks across match
 * sessions: the hook stores the channel in a ref and removes it
 * from the Supabase client in the cleanup. Re-subscribes if the
 * match id changes (shouldn't happen in practice, but keeps the hook
 * correct).
 */
export function useMatchRealtime(matchId: string, onEvent: (event: MatchEvent) => void) {
  // Cache the latest callback in a ref so the channel can always
  // invoke the freshest closure without tearing the channel down on
  // every parent render. The callback is recreated on every render at
  // the call site, so this effect fires on every render — that's
  // intentional and the cost is one ref assignment. DO NOT add
  // `onEvent` to the channel-subscription effect below; that would
  // tear down and re-subscribe the Supabase channel on every render.
  const onEventRef = useRef(onEvent);
  useEffect(() => {
    onEventRef.current = onEvent;
  });

  useEffect(() => {
    if (!matchId) return;
    const supabase = createBrowserSupabase();
    const channel = supabase.channel(`match:${matchId}`);
    let joined = false;

    // Filtered on `set_id` — the column migration 080 denormalised
    // onto `route_logs` for exactly this. The filter matters more here
    // than it did on `match_logs`: `route_logs` also carries every send
    // on every gym wall, so an unfiltered subscription would stream
    // the whole product to one Match screen.
    channel
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "routes", filter: `set_id=eq.${matchId}` },
        (payload: unknown) =>
          onEventRef.current({ kind: "route", evt: payload as MatchRealtimeEvent<MatchRoute> }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "route_logs", filter: `set_id=eq.${matchId}` },
        (payload: unknown) =>
          onEventRef.current({ kind: "log", evt: payload as MatchRealtimeEvent<MatchLog> }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "set_players", filter: `set_id=eq.${matchId}` },
        (payload: unknown) =>
          onEventRef.current({ kind: "seat", evt: payload as MatchRealtimeEvent<{ id: string }> }),
      )
      // `sets` joined the publication in migration 102. Filtered to
      // this row: the table also holds every gym Set, and realtime
      // applies the `sets` SELECT policy on top, so a subscriber only
      // ever hears about Matches they are in.
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "sets", filter: `id=eq.${matchId}` },
        (payload: unknown) =>
          onEventRef.current({ kind: "match", evt: payload as MatchRealtimeEvent<Match> }),
      )
      // The first join is the mount, whose bundle is already fresh;
      // any later one follows a drop.
      .subscribe((status) => {
        if (status !== "SUBSCRIBED") return;
        if (joined) onEventRef.current({ kind: "resume" });
        joined = true;
      });

    const onVisibility = () => {
      if (document.visibilityState === "visible") onEventRef.current({ kind: "resume" });
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      supabase.removeChannel(channel);
    };
  }, [matchId]);
}
