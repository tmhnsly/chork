import type { Meta, StoryObj } from "@storybook/nextjs";
import { RollingNumber } from "./RollingNumber";

/** Animated number counter with slide-up/down transitions. */
const meta = {
  title: "Components/RollingNumber",
  component: RollingNumber,
  parameters: { layout: "centered" },
  decorators: [
    (Story) => (
      <div style={{ fontSize: "2rem", fontFamily: "var(--font-heading)", fontStyle: "italic", fontWeight: 900 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof RollingNumber>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Zero: Story = {
  args: { value: 0 },
};

export const Five: Story = {
  args: { value: 5 },
};

export const TwoDigits: Story = {
  args: { value: 14 },
};
