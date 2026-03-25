import type { Meta, StoryObj } from "@storybook/nextjs";
import { Button } from "./Button";

const meta = {
  title: "UI/Button",
  component: Button,
  argTypes: {
    variant: {
      control: "select",
      options: ["primary", "secondary", "ghost", "danger"],
      description: "Visual style of the button",
    },
    disabled: {
      control: "boolean",
      description: "Disables the button",
    },
    children: {
      control: "text",
      description: "Button label",
    },
  },
  args: {
    children: "Button",
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
  args: { variant: "primary", children: "Save changes" },
};

export const Secondary: Story = {
  args: { variant: "secondary", children: "Choose file" },
};

export const Ghost: Story = {
  args: { variant: "ghost", children: "Edit" },
};

export const Danger: Story = {
  args: { variant: "danger", children: "Sign out" },
};

export const Disabled: Story = {
  args: { variant: "primary", children: "Saving...", disabled: true },
};
