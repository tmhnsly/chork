import type { Meta, StoryObj } from "@storybook/nextjs";
import { ActivityRings } from "./ActivityRings";

const meta = {
  title: "Components/ActivityRings",
  component: ActivityRings,
  parameters: { layout: "centered" },
} satisfies Meta<typeof ActivityRings>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty rings — no progress. */
export const Empty: Story = {
  args: {
    rings: [
      { value: 0, color: "var(--accent-solid)" },
      { value: 0, color: "var(--flash-solid)" },
      { value: 0, color: "var(--success-solid)" },
    ],
    size: 72,
  },
};

/** Partial progress — mid-session. */
export const InProgress: Story = {
  args: {
    rings: [
      { value: 0.6, color: "var(--accent-solid)" },
      { value: 0.3, color: "var(--flash-solid)" },
      { value: 0.45, color: "var(--success-solid)" },
    ],
    size: 72,
  },
};

/** Full rings — everything maxed. */
export const Complete: Story = {
  args: {
    rings: [
      { value: 1, color: "var(--accent-solid)" },
      { value: 1, color: "var(--flash-solid)" },
      { value: 1, color: "var(--success-solid)" },
    ],
    size: 72,
  },
};
