import type { Meta, StoryObj } from "@storybook/nextjs";
import { fn } from "storybook/test";
import { AvatarPicker } from "./AvatarPicker";

const meta = {
  title: "UI/AvatarPicker",
  component: AvatarPicker,
  argTypes: {
    currentUrl: { control: "text", description: "Current avatar image URL" },
    fallbackText: {
      control: "text",
      description: "Text to derive fallback initial from",
    },
    label: { control: "text", description: "Label below the avatar" },
  },
  args: {
    onFileSelect: fn(),
  },
} satisfies Meta<typeof AvatarPicker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  args: { currentUrl: null, fallbackText: "Tom" },
};

export const WithImage: Story = {
  args: {
    currentUrl: "https://api.dicebear.com/9.x/initials/svg?seed=Tom&size=128&backgroundColor=6366f1",
    fallbackText: "Tom",
    label: "Change photo",
  },
};

export const CustomLabel: Story = {
  args: { currentUrl: null, fallbackText: "+", label: "Upload avatar" },
};
