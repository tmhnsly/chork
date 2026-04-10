import type { Meta, StoryObj } from "@storybook/nextjs";
import { fn } from "storybook/test";
import { CompleteModal } from "./CompleteModal";
import { mockRoute } from "@/test/mocks";

const route = mockRoute({
  id: "route3",
  set_id: "set1",
  number: 3,
  has_zone: true,
});

const meta = {
  title: "Components/CompleteModal",
  component: CompleteModal,
  parameters: { layout: "centered" },
  args: {
    route,
    gymId: "gym_001",
    zone: false,
    onConfirm: fn(),
    onRevert: fn(),
    onCancel: fn(),
  },
} satisfies Meta<typeof CompleteModal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const MultipleAttempts: Story = {
  args: { attempts: 3 },
};

export const Flash: Story = {
  args: { attempts: 1 },
};

export const ManyAttempts: Story = {
  args: { attempts: 8 },
};
