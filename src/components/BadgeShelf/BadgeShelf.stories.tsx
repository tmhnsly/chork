import type { Meta, StoryObj } from "@storybook/nextjs";
import { BadgeShelf } from "./BadgeShelf";
import { BADGES, evaluateBadges, type BadgeContext } from "@/lib/badges";

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
    }),
  },
};

/** All badges earned. */
export const AllEarned: Story = {
  args: {
    badges: evaluateBadges({
      totalFlashes: 15,
      totalSends: 50,
      totalPoints: 150,
      completedRoutesBySet: new Map([["set1", new Set(Array.from({ length: 14 }, (_, i) => i + 1))]]),
      totalRoutesBySet: new Map([["set1", 14]]),
    }),
  },
};
