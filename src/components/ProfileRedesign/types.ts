/**
 * The data both profile mockups render, so the two are compared on
 * design rather than on one having more to show than the other.
 *
 * Mirrors what `ProfileStats` already assembles — nothing here needs
 * a new query if a variant wins.
 */
export interface ProfileMockData {
  username: string;
  name: string;
  avatarUrl: string;
  gymName: string | null;
  points: number;
  sends: number;
  flashes: number;
  flashRate: number;
  pointsPerSend: number;
  completionRate: number;
  streakCurrent: number;
  streakBest: number;
  /**
   * How the viewer stands with this climber, straight from the
   * `friend_status` RPC (migration 124). Six states because "Add
   * friend" is right in exactly one of them.
   *
   * `declined_by_me` is only ever returned to the person who did the
   * declining — a decline is silent to the person declined, so they
   * see `none`.
   */
  relation:
    | "self"
    | "none"
    | "sent"
    | "received"
    | "friends"
    | "declined_by_me";
}
