import { describe, it, expect } from "vitest";
import { usernameChunks } from "./username-display";

describe("usernameChunks", () => {
  it("keeps the underscore on the end of the preceding chunk", () => {
    // A line ending "@emil_" reads as continuing onto the next; a line
    // ending "@emil" looks like the whole handle.
    expect(usernameChunks("emil_brokenberger")).toEqual([
      "emil_",
      "brokenberger",
    ]);
  });

  it("splits a handle with several underscores", () => {
    expect(usernameChunks("dave_the_gravelgrinder")).toEqual([
      "dave_",
      "the_",
      "gravelgrinder",
    ]);
  });

  it("returns a single chunk when there's nothing to break on", () => {
    // No break opportunity is a real answer — the caller's
    // `overflow-wrap` is the safety net for one very long word.
    expect(usernameChunks("magnus")).toEqual(["magnus"]);
  });

  it("keeps a run of underscores together", () => {
    expect(usernameChunks("a__b")).toEqual(["a__", "b"]);
  });

  it("handles a trailing underscore without emitting an empty chunk", () => {
    // An empty trailing chunk would render a stray <wbr> at the very
    // end, which can leave the last line breakable after its final
    // character.
    expect(usernameChunks("tom_")).toEqual(["tom_"]);
  });

  it("handles a leading underscore", () => {
    expect(usernameChunks("_tom")).toEqual(["_", "tom"]);
  });

  it("returns nothing for an empty username", () => {
    expect(usernameChunks("")).toEqual([]);
  });

  it("never loses or reorders characters", () => {
    // The chunks are a rendering concern; joining them must always
    // reproduce the handle exactly, or we'd be displaying a different
    // username than the one stored.
    for (const handle of [
      "emil_brokenberger",
      "dave_the_gravelgrinder",
      "magnus",
      "_tom",
      "tom_",
      "a__b",
      "x_y_z_",
    ]) {
      expect(usernameChunks(handle).join("")).toBe(handle);
    }
  });
});
