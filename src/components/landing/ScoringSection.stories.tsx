import type { Meta, StoryObj } from "@storybook/nextjs";
import { ScoringSection } from "./ScoringSection";
import type { ScoreRow } from "./ScoringSection";

const meta = {
  title: "Landing/ScoringSection",
  component: ScoringSection,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof ScoringSection>;

export default meta;
type Story = StoryObj<typeof meta>;

const defaultRows: ScoreRow[] = [
  { label: "Flash (1st try)", points: "4 pts", accent: "flash" },
  { label: "2 attempts", points: "3 pts" },
  { label: "3 attempts", points: "2 pts" },
  { label: "4+ attempts", points: "1 pt" },
  { label: "Zone hold", points: "+1 pt", accent: "zone" },
];

/** Full points breakdown as shown on the landing page. */
export const Default: Story = {
  args: { rows: defaultRows },
};

const simpleRows: ScoreRow[] = [
  { label: "Send", points: "1 pt" },
  { label: "Flash", points: "3 pts", accent: "flash" },
];

/** Minimal two-row variant. */
export const Simple: Story = {
  args: { rows: simpleRows },
};
