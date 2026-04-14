import type { Meta, StoryObj } from "@storybook/nextjs";
import { ProfileHeader } from "./ProfileHeader";
import type { Profile } from "@/lib/data";

const mockUser: Profile = {
  id: "user1",
  username: "boulderking",
  name: "Alex Honnold",
  avatar_url: "",
  onboarded: true,
  active_gym_id: "gym1",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  allow_crew_invites: true,
  invites_sent_today: 0,
  invites_sent_date: null,
  theme: "default",
};

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

export const OwnProfile: Story = {
  args: { user: mockUser, isOwnProfile: true },
};

export const OtherProfile: Story = {
  args: {
    user: mockUser,
    isOwnProfile: false,
    contextLine: "Yonder · #4 this set · 2 crews",
  },
};

export const NoDisplayName: Story = {
  args: { user: { ...mockUser, name: "" }, isOwnProfile: true },
};
