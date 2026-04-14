/**
 * Avatar URL resolver — preserves the user-uploaded value when set,
 * otherwise generates a stable initials-style fallback. Pinning the
 * fallback URL shape so a future swap of the placeholder service
 * doesn't silently change every avatar in the app.
 */
import { describe, it, expect } from "vitest";
import { getAvatarUrl } from "./avatar";

const baseUser = {
  id: "user-1",
  avatar_url: "",
  name: "Tom",
  username: "tom",
};

describe("getAvatarUrl", () => {
  it("returns the user's avatar_url verbatim when set", () => {
    expect(
      getAvatarUrl({ ...baseUser, avatar_url: "https://cdn.example/x.jpg" }),
    ).toBe("https://cdn.example/x.jpg");
  });

  it("falls back to a DiceBear initials URL keyed off the name", () => {
    const url = getAvatarUrl(baseUser);
    expect(url).toContain("api.dicebear.com");
    expect(url).toContain("seed=Tom");
  });

  it("uses username when name is empty", () => {
    expect(
      getAvatarUrl({ ...baseUser, name: "" }),
    ).toContain("seed=tom");
  });

  it("uses id as the last-resort seed so the URL is always stable", () => {
    expect(
      getAvatarUrl({ ...baseUser, name: "", username: "" }),
    ).toContain("seed=user-1");
  });

  it("URL-encodes special characters in the seed", () => {
    expect(
      getAvatarUrl({ ...baseUser, name: "Magnus Meatbjørn" }),
    ).toContain("seed=Magnus%20Meatbj%C3%B8rn");
  });

  it("respects the `size` option in the generated URL", () => {
    expect(
      getAvatarUrl(baseUser, { size: 256 }),
    ).toContain("size=256");
  });
});
