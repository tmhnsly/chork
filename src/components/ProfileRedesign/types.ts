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
  /** How the viewer relates to this profile — drives the action row. */
  relation: "self" | "friend" | "stranger" | "requested";
}
