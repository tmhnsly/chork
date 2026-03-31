import type { Meta, StoryObj } from "@storybook/nextjs";
import { HowItWorksSection } from "./HowItWorksSection";
import type { Step } from "./HowItWorksSection";

const meta = {
  title: "Landing/HowItWorksSection",
  component: HowItWorksSection,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof HowItWorksSection>;

export default meta;
type Story = StoryObj<typeof meta>;

const defaultSteps: Step[] = [
  {
    number: 1,
    title: "Sign in",
    description:
      "Create your account in seconds and join the Chork climbing community.",
  },
  {
    number: 2,
    title: "See the current set",
    description:
      "Check out the active route set with grades, photos, and beta from other climbers.",
  },
  {
    number: 3,
    title: "Log your attempts",
    description:
      "Track every send and attempt on your punch card. Flash a route for bonus points.",
  },
  {
    number: 4,
    title: "Compete",
    description:
      "Climb the leaderboard, earn flash badges, and see how you stack up against the community.",
  },
];

/** Standard four-step walkthrough for the landing page. */
export const Default: Story = {
  args: {
    steps: defaultSteps,
  },
};

const threeSteps: Step[] = [
  {
    number: 1,
    title: "Pick a comp",
    description:
      "Browse upcoming bouldering competitions and register for the ones that fit your schedule.",
  },
  {
    number: 2,
    title: "Climb the set",
    description:
      "Work through every problem in the set and log your results in real time.",
  },
  {
    number: 3,
    title: "Share your results",
    description:
      "Post your scorecard, leave beta spray for others, and follow your favourite climbers.",
  },
];

/** Three-step variant demonstrating the section adapts to different step counts. */
export const ThreeSteps: Story = {
  args: {
    steps: threeSteps,
  },
};
