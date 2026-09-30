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

/**
 * Subscribes to realtime changes for a specific match's live tables
 * (match_routes, match_logs, match_players). Returns nothing — the caller
 * handles state updates via the provided callbacks.
 *
 * Cleanup on unmount is mandatory to avoid memory leaks across match
 * sessions: the hook stores the channel in a ref and removes it
 * from the Supabase client in the cleanup. Re-subscribes if the
 * match id changes (shouldn't happen in practice, but keeps the hook
 * correct).
 */
export function useMatchRealtime(
  matchId: string,
  handlers: {
    onRouteChange: (evt: MatchRealtimeEvent<MatchRoute>) => void;
    onLogChange: (evt: MatchRealtimeEvent<MatchLog>) => void;
    /**
     * Seat events. A join or leave is a full refresh, not a patch. A
     * DELETE takes a seat off the screen by its id, and the viewer's
     * own seat going means the game was deleted (`seatEventOutcome`).
     */
    onPlayerChange: (evt: MatchRealtimeEvent<{ id: string }>) => void;
    /**
     * The Match row itself changed: the host ending it (the only
     * status transition a live screen can see), or changing its setup.
     * Without it, everyone else sat on a board that had quietly stopped
     * accepting writes, or on the old setup. An UPDATE carries the
     * whole row (`sets` keeps the default replica identity, which
     * limits only what `old` holds). It also fires on every route and
     * log, because a trigger bumps `last_activity_at`.
     */
    onMatchChange: (evt: MatchRealtimeEvent<Match>) => void;
    /**
     * The feed may have missed events. Realtime never replays what it
     * sent while a socket was down, and a phone at the wall locks
     * between every climb. A missed log healed itself, because the
     * next one refetched the board, but a missed route stayed missing
     * until a reload: scores moved while the grid didn't. Fires when
     * the channel joins again after a drop, and when the page comes
     * back into view, since a suspended socket can take a while to
     * notice it died. Events between the page returning and the rejoin
     * are lost too, so both are needed.
     */
    onResume: () => void;
  },
) {
  // Cache the latest handlers in a ref so the channel callbacks can
  // always invoke the freshest closure without tearing the channel
  // down on every parent render. The handlers object is recreated on
  // every render at the call site, so this effect fires on every
  // render — that's intentional and the cost is one ref assignment.
  // DO NOT add `handlers` to the channel-subscription effect below;
  // that would tear down and re-subscribe the Supabase channel on
  // every render.
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
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
          handlersRef.current.onRouteChange(payload as MatchRealtimeEvent<MatchRoute>),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "route_logs", filter: `set_id=eq.${matchId}` },
        (payload: unknown) =>
          handlersRef.current.onLogChange(payload as MatchRealtimeEvent<MatchLog>),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "set_players", filter: `set_id=eq.${matchId}` },
        (payload: unknown) =>
          handlersRef.current.onPlayerChange(payload as MatchRealtimeEvent<{ id: string }>),
      )
      // `sets` joined the publication in migration 102. Filtered to
      // this row: the table also holds every gym Set, and realtime
      // applies the `sets` SELECT policy on top, so a subscriber only
      // ever hears about Matches they are in.
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "sets", filter: `id=eq.${matchId}` },
        (payload: unknown) =>
          handlersRef.current.onMatchChange(payload as MatchRealtimeEvent<Match>),
      )
      // The first join is the mount, whose bundle is already fresh;
      // any later one follows a drop.
      .subscribe((status) => {
        if (status !== "SUBSCRIBED") return;
        if (joined) handlersRef.current.onResume();
        joined = true;
      });

    const onVisibility = () => {
      if (document.visibilityState === "visible") handlersRef.current.onResume();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      supabase.removeChannel(channel);
    };
  }, [matchId]);
}
