import type { Meta, StoryObj } from "@storybook/nextjs";
import { ProfileHeader } from "./ProfileHeader";
import type { UsersResponse } from "@/lib/pocketbase-types";

const mockUser = {
  id: "user1",
  collectionId: "users_col",
  collectionName: "users",
  username: "boulderking",
  name: "Alex Honnold",
  email: "alex@example.com",
  avatar: "",
  onboarded: true,
  created: "2026-01-01T00:00:00Z",
  updated: "2026-01-01T00:00:00Z",
} as UsersResponse;

const meta = {
  title: "Components/ProfileHeader",
  component: ProfileHeader,
  parameters: {
    layout: "padded",
    nextjs: { appDirectory: true },
  },
} satisfies Meta<typeof ProfileHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Own profile view — shows edit button. */
export const OwnProfile: Story = {
  args: {
    user: mockUser,
    isOwnProfile: true,
  },
};

/** Another user's profile — no edit controls. */
export const OtherProfile: Story = {
  args: {
    user: mockUser,
    isOwnProfile: false,
  },
};

/** Own profile with no display name — falls back to username as heading. */
export const NoDisplayName: Story = {
  args: {
    user: { ...mockUser, name: "" } as UsersResponse,
    isOwnProfile: true,
  },
};
