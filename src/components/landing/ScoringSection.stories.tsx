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
  { label: "Flash (1st try)", points: "4 pts", weight: 1, accent: "flash" },
  { label: "2 attempts", points: "3 pts", weight: 0.75 },
  { label: "3 attempts", points: "2 pts", weight: 0.5 },
  { label: "4+ attempts", points: "1 pt", weight: 0.25 },
  { label: "Zone hold", points: "+1 pt", weight: 0.25, accent: "zone" },
];

/** Full points breakdown as shown on the landing page. */
export const Default: Story = {
  args: { rows: defaultRows },
};

const simpleRows: ScoreRow[] = [
  { label: "Send", points: "1 pt", weight: 0.33 },
  { label: "Flash", points: "3 pts", weight: 1, accent: "flash" },
];

/** Minimal two-row variant. */
export const Simple: Story = {
  args: { rows: simpleRows },
};
