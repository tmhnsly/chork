import type { Meta, StoryObj } from "@storybook/nextjs";
import { ProfileForm } from "./profile-form";
import type { UsersResponse } from "@/lib/pocketbase-types";
import { Collections } from "@/lib/pocketbase-types";

const mockUser: UsersResponse = {
  id: "usr_abc123def456",
  collectionId: "users",
  collectionName: Collections.Users,
  email: "alex@example.com",
  emailVisibility: false,
  username: "boulderking",
  verified: true,
  avatar: "" as UsersResponse["avatar"],
  name: "Alex Honnold",
  onboarded: true,
  password: "",
  tokenKey: "",
  created: "2025-11-15T10:30:00.000Z" as UsersResponse["created"],
  updated: "2026-03-20T14:45:00.000Z" as UsersResponse["updated"],
};

const meta = {
  title: "App/ProfileForm",
  component: ProfileForm,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof ProfileForm>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Default profile view with username and display name populated. */
export const Default: Story = {
  args: {
    user: mockUser,
  },
};

/** User with an empty display name field. */
export const NoDisplayName: Story = {
  args: {
    user: {
      ...mockUser,
      name: "",
    },
  },
};

/** Recently onboarded user with minimal profile data. */
export const NewUser: Story = {
  args: {
    user: {
      ...mockUser,
      id: "usr_new789xyz012",
      username: "newclimber42",
      name: "",
      onboarded: true,
      created: "2026-03-21T08:00:00.000Z" as UsersResponse["created"],
      updated: "2026-03-21T08:00:00.000Z" as UsersResponse["updated"],
    },
  },
};
