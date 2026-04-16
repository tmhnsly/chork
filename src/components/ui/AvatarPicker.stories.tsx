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
    // Generic placeholder portrait — picsum is a stable demo source
    // (no auth, deterministic via the seed). Doesn't represent a real
    // upload; just stands in for "user has a photo set".
    currentUrl: "https://picsum.photos/seed/chork-avatar/128",
    fallbackText: "Tom",
    label: "Change photo",
  },
};

export const CustomLabel: Story = {
  args: { currentUrl: null, fallbackText: "+", label: "Upload avatar" },
};
