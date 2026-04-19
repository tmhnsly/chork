import type { Meta, StoryObj } from "@storybook/nextjs";
import { FeatureGrid } from "./FeatureGrid";

const meta = {
  title: "Landing/FeatureGrid",
  component: FeatureGrid,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof FeatureGrid>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Climber-focused bento — Chorkboard, Wall, Jams, Flash, Zone, Crews,
 * Beta, Your stats, Achievements, Community grades. Each tile's
 * visual is a container query so it scales with its own width.
 */
export const Default: Story = {};
