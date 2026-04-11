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
  follower_count: 42,
  following_count: 18,
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
  args: { user: mockUser, isOwnProfile: true, followerCount: 42, followingCount: 18 },
};

export const OtherProfile: Story = {
  args: { user: mockUser, isOwnProfile: false, isFollowing: false, followerCount: 42, followingCount: 18 },
};

export const FollowingOtherProfile: Story = {
  args: { user: mockUser, isOwnProfile: false, isFollowing: true, followerCount: 42, followingCount: 18 },
};

export const NoDisplayName: Story = {
  args: { user: { ...mockUser, name: "" }, isOwnProfile: true, followerCount: 0, followingCount: 0 },
};
