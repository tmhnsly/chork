import type { Meta, StoryObj } from "@storybook/nextjs";
import { HeroCardProfile } from "./HeroCardProfile";
import { TileGridProfile } from "./TileGridProfile";
import type { ProfileMockData } from "./types";

/**
 * Two directions for the profile's top half, on identical data, so the
 * comparison is about design rather than one having more to show.
 *
 * Both fix the same two things: the all-time block's six equal grey
 * rectangles, and a profile that offered no way to act on the climber
 * you were looking at.
 */
const base: ProfileMockData = {
  username: "tom",
  name: "Tom Hinsley",
  avatarUrl: "",
  gymName: "Yonder",
  points: 284,
  sends: 71,
  flashes: 23,
  flashRate: 0.32,
  pointsPerSend: 4.0,
  completionRate: 0.67,
  streakCurrent: 4,
  streakBest: 9,
  relation: "stranger",
};

const meta = {
  title: "Profile redesign/Directions",
  parameters: { layout: "padded" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** Variant A — identity, numbers and actions fused into one card. */
export const A_HeroCard: Story = {
  render: () => <HeroCardProfile data={base} />,
};

/** Variant B — current layout, all-time rebuilt as weighted tiles. */
export const B_TileGrid: Story = {
  render: () => <TileGridProfile data={base} />,
};

/** Both, stacked, for a direct read. */
export const SideBySide: Story = {
  render: () => (
    <div style={{ display: "grid", gap: "3rem" }}>
      <HeroCardProfile data={base} />
      <TileGridProfile data={base} />
    </div>
  ),
};

/**
 * The action row in every state it has. This is the part that does not
 * exist today at all, so it is worth seeing on its own — "Add friend"
 * is only correct for a stranger, and showing it otherwise is how an
 * app teaches you not to trust its buttons.
 */
export const ActionStates: Story = {
  render: () => (
    <div style={{ display: "grid", gap: "1.5rem" }}>
      <HeroCardProfile data={{ ...base, relation: "stranger" }} />
      <HeroCardProfile data={{ ...base, relation: "requested" }} />
      <HeroCardProfile data={{ ...base, relation: "friend" }} />
      <HeroCardProfile data={{ ...base, relation: "self" }} />
    </div>
  ),
};
