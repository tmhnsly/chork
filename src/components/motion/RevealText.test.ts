import { describe, it, expect } from "vitest";
import { splitSegments } from "./RevealText";
import { usernameChunks } from "@/lib/data/username-display";

const texts = (t: string, dividers?: string) =>
  splitSegments(t, dividers).map((s) => s.text);

describe("splitSegments", () => {
  it("keeps the divider on the end of the segment before it", () => {
    // A line ending "@emil_" reads as continuing onto the next; a line
    // ending "@emil" looks like the whole handle.
    expect(texts("@emil_brokenberger")).toEqual(["@emil_", "brokenberger"]);
  });

  it("never makes the @ a segment of its own", () => {
    // Each segment is an inline-block, so a free-standing "@" is a
    // free-standing line box. At 280px a long handle rendered "@"
    // alone on the first line with the name below it.
    expect(texts("@bartholomewwolfgangerson")).toEqual([
      "@bartholomewwolfgangerson",
    ]);
    for (const seg of splitSegments("@dave_the_gravelgrinder")) {
      expect(seg.text).not.toBe("@");
    }
  });

  it("never emits a divider as a segment of its own", () => {
    // Same reason: a lone "_" could be left stranded on its own line.
    for (const seg of splitSegments("@a_b_c")) {
      expect(seg.text).not.toBe("_");
    }
  });

  it("keeps spaces so multi-word copy doesn't collapse", () => {
    // Without capturing whitespace, "The Wall" renders as "TheWall".
    const segs = splitSegments("Off the wall");
    expect(segs.map((s) => s.text)).toEqual(["Off", "the", "wall"]);
    expect(segs.map((s) => s.trailing)).toEqual([" ", " ", ""]);
  });

  it("collapses nothing and loses nothing", () => {
    // The segments are a rendering concern; reassembling them must
    // reproduce the input exactly, or the header displays different
    // text than it was given.
    for (const t of [
      "@emil_brokenberger",
      "Off the wall",
      "Something went",
      "A live board.",
      "@a__b",
      "@_tom",
      "@tom_",
      "@magnus",
    ]) {
      expect(splitSegments(t).map((s) => s.text + s.trailing).join("")).toBe(t);
    }
  });

  it("handles empty text", () => {
    expect(splitSegments("")).toEqual([]);
  });

  it("respects a custom divider set", () => {
    expect(texts("a-b_c", "-")).toEqual(["a-", "b_c"]);
  });

  it("breaks a handle exactly where <Username> would", () => {
    // The profile header renders a handle through RevealText; every
    // other surface renders it through <Username>, which chunks with
    // `usernameChunks`. Both decide where a line may break, so a
    // handle that breaks one way on the profile and another way on
    // the leaderboard is a bug in whichever drifted. This test is the
    // only thing holding the two rules together.
    for (const handle of [
      "emil_brokenberger",
      "dave_the_gravelgrinder",
      "magnus",
      "a__b",
      "tom_",
    ]) {
      const viaReveal = texts(`@${handle}`);
      const viaUsername = usernameChunks(handle);
      // <Username> binds the "@" to its first chunk for the same
      // reason RevealText no longer splits on it.
      viaUsername[0] = `@${viaUsername[0]}`;
      expect(viaReveal).toEqual(viaUsername);
    }
  });
});
