import type { Meta, StoryObj } from "@storybook/nextjs";
import { fn } from "storybook/test";
import { CompleteModal } from "./CompleteModal";
import type { Route } from "@/lib/data";

const mockRoute: Route = {
  id: "route3",
  set_id: "set1",
  number: 3,

  has_zone: true,
  created: "2026-04-01T00:00:00Z",
  updated: "2026-04-01T00:00:00Z",
};

const meta = {
  title: "Components/CompleteModal",
  component: CompleteModal,
  parameters: { layout: "centered" },
  args: {
    route: mockRoute,
    onConfirm: fn(),
    onCancel: fn(),
  },
} satisfies Meta<typeof CompleteModal>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Standard completion flow with multiple attempts. */
export const MultipleAttempts: Story = {
  args: {
    attempts: 3,
  },
};

/** Flash completion — attempts equal 1, shows flash callout with bolt icon. */
export const Flash: Story = {
  args: {
    attempts: 1,
  },
};

/** Higher attempt count showing 8 attempts. */
export const ManyAttempts: Story = {
  args: {
    attempts: 8,
  },
};
