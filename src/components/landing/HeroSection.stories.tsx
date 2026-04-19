import type { Meta, StoryObj } from "@storybook/nextjs";
import { HeroSection } from "./HeroSection";
import { HeroGrid } from "./HeroGrid";
import { FaArrowRight } from "react-icons/fa6";
import { Button } from "@/components/ui";

const meta = {
  title: "Landing/HeroSection",
  component: HeroSection,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof HeroSection>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Hero with the animated send grid visual. */
export const WithGrid: Story = {
  args: {
    headline: "Track your sends. Compete with your crew.",
    subheadline: "The bouldering comp tracker that keeps score so you can keep climbing.",
    cta: <Button>Get started<FaArrowRight aria-hidden /></Button>,
    visual: <HeroGrid />,
  },
};

/** Hero without visual — text-only layout. */
export const TextOnly: Story = {
  args: {
    headline: "Track your sends. Compete with your crew.",
    subheadline: "The bouldering comp tracker that keeps score so you can keep climbing.",
    cta: <Button>Get started<FaArrowRight aria-hidden /></Button>,
  },
};
