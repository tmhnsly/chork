import type { Meta, StoryObj } from "@storybook/nextjs";
import { NavBar } from "./NavBar";

/** Global navigation bar with Chork logo and auth controls. */
const meta = {
  title: "Components/NavBar",
  component: NavBar,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof NavBar>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Logged-out state (no auth cookie). */
export const LoggedOut: Story = {
  args: { initialShell: "unauthed" },
};

/** Logged-in, no gym — Crew / Jam / Profile only. */
export const AuthedNoGymSkeleton: Story = {
  args: { initialShell: "authed-no-gym" },
};

/** Logged-in with a gym — full tab row. */
export const AuthedWithGymSkeleton: Story = {
  args: { initialShell: "authed-with-gym" },
};
