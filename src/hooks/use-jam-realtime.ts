"use client";

import { useEffect, useRef } from "react";
import { createBrowserSupabase } from "@/lib/supabase/client";

type ChangeHandler = (payload: unknown) => void;

/**
 * Subscribes to realtime changes for a specific jam's live tables
 * (jam_routes, jam_logs, jam_players). Returns nothing — the caller
 * handles state updates via the provided callbacks.
 *
 * Cleanup on unmount is mandatory to avoid memory leaks across jam
 * sessions: the hook stores the channel in a ref and removes it
 * from the Supabase client in the cleanup. Re-subscribes if the
 * jam id changes (shouldn't happen in practice, but keeps the hook
 * correct).
 */
export function useJamRealtime(
  jamId: string,
  handlers: {
    onRouteChange: ChangeHandler;
    onLogChange: ChangeHandler;
    onPlayerChange: ChangeHandler;
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
    if (!jamId) return;
    const supabase = createBrowserSupabase();
    const channel = supabase.channel(`jam:${jamId}`);

    channel
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "jam_routes", filter: `jam_id=eq.${jamId}` },
        (payload: unknown) => handlersRef.current.onRouteChange(payload),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "jam_logs", filter: `jam_id=eq.${jamId}` },
        (payload: unknown) => handlersRef.current.onLogChange(payload),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "jam_players", filter: `jam_id=eq.${jamId}` },
        (payload: unknown) => handlersRef.current.onPlayerChange(payload),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [jamId]);
}
