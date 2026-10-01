import { describe, it, expect } from "vitest";
import { channelStatusEvent } from "./use-match-realtime";

describe("channelStatusEvent", () => {
  it("resyncs on the FIRST join, not just a rejoin", () => {
    // The regression: a route added, the player navigates away and back
    // within the router cache's minute, the screen mounts from the old
    // payload, and the first join — skipped as "already fresh" — never
    // fetched the route. It stayed missing until a hard refresh.
    expect(channelStatusEvent("SUBSCRIBED")).toEqual({ kind: "resume" });
  });

  it("resyncs on every later join too", () => {
    expect(channelStatusEvent("SUBSCRIBED")).toEqual({ kind: "resume" });
    expect(channelStatusEvent("SUBSCRIBED")).toEqual({ kind: "resume" });
  });

  it("says nothing for a status that isn't a join", () => {
    for (const status of ["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"]) {
      expect(channelStatusEvent(status), status).toBeNull();
    }
  });
});
