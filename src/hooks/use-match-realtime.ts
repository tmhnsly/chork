"use client";

import { useEffect, useRef } from "react";
import { createBrowserSupabase } from "@/lib/supabase/client";
import type { MatchLog, MatchRoute } from "@/lib/data/match-types";

/**
 * Shape of a Supabase postgres_changes payload for a Match table. The
 * cast from the wire's `unknown` happens ONCE, in this module — the
 * caller receives typed events instead of re-deriving the shape at
 * every handler (MatchScreen used to hand-write this cast twice).
 *
 * Caveat carried over from the raw payloads: on DELETE, `new` is an
 * empty object and only `old` is populated (`routes`, `route_logs`
 * and `set_players` run REPLICA IDENTITY FULL — migration 085 — so
 * `old` carries the full row); on INSERT/UPDATE,
 * `old` may be partial. Branch on `eventType` before trusting either
 * side.
 */
export interface MatchRealtimeEvent<T> {
  eventType: "INSERT" | "UPDATE" | "DELETE";
  new: T;
  old: T;
}

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
    /** Join/leave events — payload deliberately untyped; the current
     *  strategy is a full refresh, not a patch. */
    onPlayerChange: () => void;
    /**
     * The Match row itself changed. Fires for the host ending it,
     * which is the only status transition a live screen can see —
     * without this, everyone else sat on a board that had quietly
     * stopped accepting writes.
     */
    onMatchChange: (evt: MatchRealtimeEvent<{ id: string; status: string }>) => void;
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
        () => handlersRef.current.onPlayerChange(),
      )
      // `sets` joined the publication in migration 102. Filtered to
      // this row: the table also holds every gym Set, and realtime
      // applies the `sets` SELECT policy on top, so a subscriber only
      // ever hears about Matches they are in.
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "sets", filter: `id=eq.${matchId}` },
        (payload: unknown) =>
          handlersRef.current.onMatchChange(
            payload as MatchRealtimeEvent<{ id: string; status: string }>,
          ),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [matchId]);
}
