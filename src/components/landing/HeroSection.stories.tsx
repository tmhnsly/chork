import type { Meta, StoryObj } from "@storybook/nextjs";
import { HeroSection } from "./HeroSection";

const meta = {
  title: "Landing/HeroSection",
  component: HeroSection,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof HeroSection>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Default hero with the primary marketing headline and a "Get started" CTA. */
export const Default: Story = {
  args: {
    headline: "Track your sends. Compete with your crew.",
    subheadline:
      "The bouldering comp tracker that keeps score so you can keep climbing.",
    cta: (
      <button
        style={{
          minHeight: 44,
          padding: "12px 24px",
          background: "var(--accent-solid)",
          color: "var(--accent-on-solid)",
          border: "none",
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Get started
      </button>
    ),
  },
};

/** Alternate copy variant with a punchier headline and "Join now" CTA. */
export const AlternateCopy: Story = {
  args: {
    headline: "Climb harder. Log everything.",
    subheadline:
      "A dead-simple way to track your progress and compete at your local gym.",
    cta: (
      <button
        style={{
          minHeight: 44,
          padding: "12px 24px",
          background: "var(--accent-solid)",
          color: "var(--accent-on-solid)",
          border: "none",
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Join now
      </button>
    ),
  },
};
