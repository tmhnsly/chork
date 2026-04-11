import type { Meta, StoryObj } from "@storybook/nextjs";
import { DemoTile } from "./DemoTile";
import { TILE_STATES } from "@/lib/data";

/** Presentational punch tile — no interactivity. Used in the landing hero. */
const meta = {
  title: "Landing/DemoTile",
  component: DemoTile,
  argTypes: {
    state: {
      control: "select",
      options: [...TILE_STATES],
    },
  },
  decorators: [
    (Story) => (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 80px)", gap: 8 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof DemoTile>;

export default meta;
type Story = StoryObj<typeof meta>;

/** All four states side by side. */
export const AllStates: Story = {
  render: () => (
    <>
      <DemoTile number={1} state="empty" />
      <DemoTile number={2} state="attempted" />
      <DemoTile number={3} state="completed" />
      <DemoTile number={4} state="flash" />
    </>
  ),
  args: { number: 1, state: "empty" },
};

/** Single empty tile. */
export const Empty: Story = { args: { number: 5, state: "empty" } };

/** Single completed tile. */
export const Completed: Story = { args: { number: 3, state: "completed" } };

/** Single flash tile. */
export const Flash: Story = { args: { number: 7, state: "flash" } };
