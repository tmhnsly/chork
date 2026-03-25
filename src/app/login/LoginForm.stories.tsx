import type { Meta, StoryObj } from "@storybook/nextjs";
import { LoginForm } from "./login-form";

/**
 * The login page with Google OAuth sign-in button.
 * Shown to unauthenticated users.
 */
const meta = {
  title: "Pages/Login",
  component: LoginForm,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof LoginForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
