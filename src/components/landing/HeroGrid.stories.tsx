import type { Meta, StoryObj } from "@storybook/nextjs";
import { HeroGrid } from "./HeroGrid";

/** Animated 4x3 punch card grid used as the landing page hero visual. */
const meta = {
  title: "Landing/HeroGrid",
  component: HeroGrid,
  parameters: {
    layout: "padded",
  },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 320 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof HeroGrid>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Animated grid — tiles stagger from empty to their final states, then loop. */
export const Default: Story = {};
