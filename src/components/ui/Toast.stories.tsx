import type { Meta, StoryObj } from "@storybook/nextjs";
import { ToastProvider, showToast } from "./Toast";
import { Button } from "./Button";

/**
 * Toast notifications for transient feedback (save confirmations, errors, etc).
 *
 * ## Setup
 *
 * `<ToastProvider />` is rendered once in `providers.tsx`. No additional setup needed.
 *
 * ## Usage
 *
 * ```tsx
 * import { showToast } from "@/components/ui";
 *
 * // Success (default)
 * showToast("Profile updated");
 *
 * // Error — shows for 5s instead of 3s
 * showToast("Failed to save", "error");
 *
 * // Info
 * showToast("Your profile is now public", "info");
 *
 * // Warning
 * showToast("Username can only be changed once per month", "warning");
 * ```
 *
 * ## Variants
 *
 * | Variant | Icon | Duration | Use for |
 * |---------|------|----------|---------|
 * | `success` | Check | 3s | Save confirmations |
 * | `error` | Exclamation | 5s | API/validation failures |
 * | `info` | Info circle | 3s | Neutral notifications |
 * | `warning` | Triangle | 3s | Caution messages |
 */
const meta = {
  title: "UI/Toast",
  parameters: {
    layout: "centered",
  },
  decorators: [
    (Story) => (
      <>
        <Story />
        <ToastProvider />
      </>
    ),
  ],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Success: Story = {
  render: () => (
    <Button onClick={() => showToast("Profile updated")}>
      Show success toast
    </Button>
  ),
};

export const Error: Story = {
  render: () => (
    <Button
      variant="danger"
      onClick={() => showToast("[400] Username is taken", "error")}
    >
      Show error toast
    </Button>
  ),
};

export const Info: Story = {
  render: () => (
    <Button
      variant="secondary"
      onClick={() => showToast("Your profile is now public", "info")}
    >
      Show info toast
    </Button>
  ),
};

export const Warning: Story = {
  render: () => (
    <Button
      variant="secondary"
      onClick={() =>
        showToast("Username can only be changed once per month", "warning")
      }
    >
      Show warning toast
    </Button>
  ),
};
