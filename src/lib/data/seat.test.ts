import { describe, it, expect } from "vitest";
import { ownerIdOf, isGuestSeat, seatName, seatAvatarUser } from "./seat";

describe("ownerIdOf", () => {
  it("prefers the account, falls back to the seat", () => {
    expect(ownerIdOf({ user_id: "u1", player_id: "p1" })).toBe("u1");
    expect(ownerIdOf({ user_id: null, player_id: "p1" })).toBe("p1");
    expect(ownerIdOf({ user_id: null })).toBe("");
  });
});

describe("isGuestSeat", () => {
  it("trusts an explicit flag over the account check", () => {
    expect(isGuestSeat({ is_guest: true, user_id: "u1" })).toBe(true);
    expect(isGuestSeat({ is_guest: false, user_id: null })).toBe(false);
  });
  it("derives from the missing account when unflagged", () => {
    expect(isGuestSeat({ user_id: null })).toBe(true);
    expect(isGuestSeat({ user_id: "u1" })).toBe(false);
  });
});

describe("seatName — one ladder for every surface", () => {
  it("display name wins", () => {
    expect(seatName({ display_name: "Hazel", username: "haze" })).toBe("Hazel");
  });
  it("whitespace is not a name", () => {
    expect(seatName({ display_name: "   ", username: "haze" })).toBe("haze");
  });
  it("gym rows carry the profile name in `name`", () => {
    expect(seatName({ name: "Hazel", username: "haze" })).toBe("Hazel");
  });
  it("a guest seat without a display name is a Guest", () => {
    expect(seatName({ is_guest: true, user_id: null, player_id: "p1" })).toBe(
      "Guest",
    );
  });
  it("a deleted account resolves to the surface's fallback", () => {
    expect(seatName({ user_id: "u1" })).toBe("Climber");
    expect(seatName({ user_id: "u1" }, { fallback: "Unknown climber" })).toBe(
      "Unknown climber",
    );
  });
});

describe("seatAvatarUser", () => {
  it("keys a guest's avatar by their seat — never an empty string", () => {
    const guest = seatAvatarUser({
      user_id: null,
      player_id: "seat-9",
      display_name: "Alex",
      is_guest: true,
    });
    expect(guest.id).toBe("seat-9");
    expect(guest.name).toBe("Alex");
    expect(guest.username).toBe("unknown");
    expect(guest.avatar_url).toBe("");
  });
  it("gives the glyph an initial even when only the handle exists", () => {
    expect(seatAvatarUser({ user_id: "u1", username: "haze" }).name).toBe(
      "haze",
    );
  });
  it("passes an account row through unchanged", () => {
    expect(
      seatAvatarUser({
        user_id: "u1",
        username: "haze",
        name: "Hazel",
        avatar_url: "https://x/y.jpg",
      }),
    ).toEqual({
      id: "u1",
      username: "haze",
      name: "Hazel",
      avatar_url: "https://x/y.jpg",
    });
  });
});
