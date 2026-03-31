import type { Meta, StoryObj } from "@storybook/nextjs";
import { FeatureGrid } from "./FeatureGrid";
import type { FeatureItem } from "./FeatureGrid";
import {
  FaBolt,
  FaTrophy,
  FaComments,
  FaChartLine,
  FaUsers,
  FaStar,
} from "react-icons/fa6";

const meta = {
  title: "Landing/FeatureGrid",
  component: FeatureGrid,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof FeatureGrid>;

export default meta;
type Story = StoryObj<typeof meta>;

const sixItems: FeatureItem[] = [
  {
    icon: <FaBolt />,
    title: "Flash Tracking",
    description:
      "Automatically detect first-try sends and earn flash badges on your scorecard.",
  },
  {
    icon: <FaTrophy />,
    title: "Live Leaderboard",
    description:
      "See where you stack up against your crew with real-time point totals.",
  },
  {
    icon: <FaComments />,
    title: "Beta Spray",
    description:
      "Share tips and tricks on any route. Spoiler-blurred until you complete the climb.",
  },
  {
    icon: <FaChartLine />,
    title: "Progress Stats",
    description:
      "Track your completion rate, attempt averages, and points over time.",
  },
  {
    icon: <FaUsers />,
    title: "Follow Climbers",
    description:
      "Follow friends, see their sends in your feed, and cheer them on.",
  },
  {
    icon: <FaStar />,
    title: "Route Grading",
    description:
      "Community-driven difficulty ratings so you know what you are getting into.",
  },
];

/** Default grid showing all six feature cards. */
export const Default: Story = {
  args: {
    items: sixItems,
  },
};

/** Three-item variant to demonstrate how the grid adapts to fewer cards. */
export const ThreeItems: Story = {
  args: {
    items: sixItems.slice(0, 3),
  },
};
