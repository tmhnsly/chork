import type { Meta, StoryObj } from "@storybook/nextjs";
import { LoginForm } from "./login-form";

/** Login page with email/password sign-in and sign-up. */
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
