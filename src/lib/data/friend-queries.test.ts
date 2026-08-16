import { describe, it, expect } from "vitest";
import { partitionFriends, type Friend } from "./friend-queries";

function friend(over: Partial<Friend>): Friend {
  return {
    friend_id: "m1",
    user_id: "u1",
    username: "ada",
    name: "Ada",
    avatar_url: null,
    status: "active",
    direction: "active",
    created_at: "2026-08-16T00:00:00Z",
    ...over,
  };
}

describe("partitionFriends", () => {
  it("splits the three states the UI shows separately", () => {
    const rows = [
      friend({ friend_id: "a", direction: "active" }),
      friend({ friend_id: "b", direction: "incoming", status: "pending" }),
      friend({ friend_id: "c", direction: "outgoing", status: "pending" }),
      friend({ friend_id: "d", direction: "incoming", status: "pending" }),
    ];
    const out = partitionFriends(rows);
    expect(out.active.map((m) => m.friend_id)).toEqual(["a"]);
    expect(out.incoming.map((m) => m.friend_id)).toEqual(["b", "d"]);
    expect(out.outgoing.map((m) => m.friend_id)).toEqual(["c"]);
  });

  it("puts every row in exactly one bucket", () => {
    // A row that lands in none would silently vanish from the page,
    // and one that lands in two would let you accept your own request.
    const rows = [
      friend({ friend_id: "a", direction: "active" }),
      friend({ friend_id: "b", direction: "incoming" }),
      friend({ friend_id: "c", direction: "outgoing" }),
    ];
    const out = partitionFriends(rows);
    const total = out.active.length + out.incoming.length + out.outgoing.length;
    expect(total).toBe(rows.length);
  });

  it("survives an empty graph", () => {
    const out = partitionFriends([]);
    expect(out).toEqual({ active: [], incoming: [], outgoing: [] });
  });
});
