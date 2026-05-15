import type { Meta, StoryObj } from "@storybook/nextjs";
import { BadgeShelf } from "./BadgeShelf";
import { evaluateBadges, type BadgeContext } from "@/lib/badges";

const meta = {
  title: "Components/BadgeShelf",
  component: BadgeShelf,
  parameters: { layout: "padded" },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 500 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof BadgeShelf>;

export default meta;
type Story = StoryObj<typeof meta>;

const emptyCtx: BadgeContext = {
  totalFlashes: 0,
  totalSends: 0,
  totalPoints: 0,
  completedRoutesBySet: new Map(),
  totalRoutesBySet: new Map(),
  flashedRoutesBySet: new Map(),
  zoneAvailableBySet: new Map(),
  zoneClaimedBySet: new Map(),
  jamsPlayed: 0,
  jamsWon: 0,
  jamsHosted: 0,
  maxPlayersInWonJam: 0,
  uniqueJamCoplayers: 0,
  ironCrewMaxPairCount: 0,
};

/** No badges earned yet — all locked with zero progress. */
export const AllLocked: Story = {
  args: { badges: evaluateBadges(emptyCtx) },
};

/** Mixed earned and locked badges with progress. */
export const MixedProgress: Story = {
  args: {
    badges: evaluateBadges({
      totalFlashes: 3,
      totalSends: 8,
      totalPoints: 42,
      completedRoutesBySet: new Map([["set1", new Set([1, 2, 3])]]),
      totalRoutesBySet: new Map([["set1", 14]]),
      flashedRoutesBySet: new Map([["set1", new Set([1])]]),
      zoneAvailableBySet: new Map([["set1", new Set([3, 7, 11])]]),
      zoneClaimedBySet: new Map([["set1", new Set([3])]]),
      jamsPlayed: 2,
      jamsWon: 1,
      jamsHosted: 1,
      maxPlayersInWonJam: 4,
      uniqueJamCoplayers: 3,
      ironCrewMaxPairCount: 2,
    }),
  },
};

/** All badges earned. */
export const AllEarned: Story = {
  args: {
    badges: evaluateBadges({
      totalFlashes: 1200,
      totalSends: 1200,
      totalPoints: 5000,
      completedRoutesBySet: new Map([["set1", new Set(Array.from({ length: 14 }, (_, i) => i + 1))]]),
      totalRoutesBySet: new Map([["set1", 14]]),
      flashedRoutesBySet: new Map([["set1", new Set(Array.from({ length: 14 }, (_, i) => i + 1))]]),
      zoneAvailableBySet: new Map([["set1", new Set([3, 7, 11])]]),
      zoneClaimedBySet: new Map([["set1", new Set([3, 7, 11])]]),
      jamsPlayed: 40,
      jamsWon: 30,
      jamsHosted: 15,
      maxPlayersInWonJam: 12,
      uniqueJamCoplayers: 25,
      ironCrewMaxPairCount: 15,
    }),
  },
};
