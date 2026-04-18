import type { Meta, StoryObj } from "@storybook/nextjs";
import { SendGridTile } from "./SendGridTile";
import { TILE_STATES } from "@/lib/data";

/**
 * Individual route tile in the send grid.
 * Shows the route number and reflects the user's log state.
 */
const meta = {
  title: "Components/SendGridTile",
  component: SendGridTile,
  argTypes: {
    number: { control: { type: "number", min: 1, max: 20 } },
    state: {
      control: "select",
      options: [...TILE_STATES],
    },
  },
  args: {
    number: 1,
  },
  decorators: [
    (Story) => (
      <div style={{ width: 80 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SendGridTile>;

export default meta;
type Story = StoryObj<typeof meta>;

/** No log or zero attempts. */
export const Empty: Story = {
  args: { number: 4, state: "empty" },
};

/** Log exists but not completed. */
export const Attempted: Story = {
  args: { number: 6, state: "attempted" },
};

/** Completed in more than one attempt. */
export const Completed: Story = {
  args: { number: 3, state: "completed" },
};

/** Completed on first attempt — shows flash badge. */
export const Flash: Story = {
  args: { number: 5, state: "flash" },
};

/** Completed with zone bonus — shows bullseye badge top-left. */
export const CompletedWithZone: Story = {
  args: { number: 7, state: "completed", zone: true },
};

/** Flash with zone — both badges visible. */
export const FlashWithZone: Story = {
  args: { number: 2, state: "flash", zone: true },
};
