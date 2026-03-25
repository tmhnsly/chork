import type { Meta, StoryObj } from "@storybook/nextjs";
import { Banner } from "./Banner";

const meta = {
  title: "UI/Banner",
  component: Banner,
  argTypes: {
    variant: {
      control: "select",
      options: ["info", "success", "warning", "error"],
      description: "Visual style and icon",
    },
    children: { control: "text", description: "Message content" },
  },
  decorators: [
    (Story) => (
      <div style={{ width: 400 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Banner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Info: Story = {
  args: { variant: "info", children: "Your profile is visible to other users." },
};

export const Success: Story = {
  args: { variant: "success", children: "Profile updated" },
};

export const Warning: Story = {
  args: {
    variant: "warning",
    children: "Your username can only be changed once every 30 days.",
  },
};

export const Error: Story = {
  args: {
    variant: "error",
    children: "[400] Failed to create record. — username: Username is taken",
  },
};
