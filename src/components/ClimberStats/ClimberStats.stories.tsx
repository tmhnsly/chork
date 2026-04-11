import type { Meta, StoryObj } from "@storybook/nextjs";
import { ClimberStats } from "./ClimberStats";

/** Profile stats with swipeable Current Set / All Time tabs. */
const meta = {
  title: "Components/ClimberStats",
  component: ClimberStats,
  parameters: { layout: "padded" },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 500 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ClimberStats>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Active set with current-set stats and all-time totals. */
export const WithActiveSet: Story = {
  args: {
    currentSet: { points: 24, completions: 8, flashes: 3 },
    allTimeCompletions: 45,
    allTimeFlashes: 12,
    allTimePoints: 120,
  },
};

/** No active set — only all-time stats, no tabs. */
export const NoActiveSet: Story = {
  args: {
    currentSet: null,
    allTimeCompletions: 22,
    allTimeFlashes: 5,
    allTimePoints: 55,
  },
};

/** Brand-new climber with zero activity. */
export const NewClimber: Story = {
  args: {
    currentSet: { points: 0, completions: 0, flashes: 0 },
    allTimeCompletions: 0,
    allTimeFlashes: 0,
    allTimePoints: 0,
  },
};
