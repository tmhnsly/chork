import type { Meta, StoryObj } from "@storybook/nextjs";
import { GradePyramid } from "./GradePyramid";
import { buildGradeDistribution } from "@/lib/data/grade-distribution";

const meta = {
  title: "Components/GradePyramid",
  component: GradePyramid,
  parameters: { layout: "padded" },
} satisfies Meta<typeof GradePyramid>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Build a pyramid the same way the profile does — through the real
 *  shaping function, so a story can't drift from production. */
function pyramid(
  rows: Array<{ grade: number; sends: number; flashes?: number }>,
  over: { discipline?: string; grading_scale?: string } = {},
) {
  return buildGradeDistribution(
    rows.map((r) => ({
      discipline: over.discipline ?? "boulder",
      grading_scale: over.grading_scale ?? "v",
      grade: r.grade,
      sends: r.sends,
      flashes: r.flashes ?? 0,
    })),
  ).pyramids[0];
}

/** The healthy shape: broad base, narrowing toward a project grade. */
export const Classic: Story = {
  args: {
    pyramid: pyramid([
      { grade: 1, sends: 12, flashes: 11 },
      { grade: 2, sends: 18, flashes: 14 },
      { grade: 3, sends: 15, flashes: 7 },
      { grade: 4, sends: 9, flashes: 2 },
      { grade: 5, sends: 4 },
      { grade: 6, sends: 1 },
    ]),
  },
};

/** A gap reads as a gap — the rung is drawn empty rather than skipped. */
export const WithAGap: Story = {
  args: {
    pyramid: pyramid([
      { grade: 2, sends: 8, flashes: 6 },
      { grade: 5, sends: 2 },
    ]),
  },
};

/** Ropes get their own pyramid, in their own scale — never converted. */
export const SportOnFrench: Story = {
  args: {
    pyramid: pyramid(
      [
        { grade: 4, sends: 6, flashes: 4 },
        { grade: 6, sends: 3, flashes: 1 },
        { grade: 8, sends: 1 },
      ],
      { discipline: "sport", grading_scale: "french" },
    ),
  },
};

/** Everything flashed — the tint fills each bar completely. */
export const AllFlashed: Story = {
  args: {
    pyramid: pyramid([
      { grade: 1, sends: 5, flashes: 5 },
      { grade: 2, sends: 3, flashes: 3 },
    ]),
  },
};

/** A single send, which is where most climbers start. */
export const JustStarted: Story = {
  args: { pyramid: pyramid([{ grade: 2, sends: 1 }]) },
};
