import type { Meta, StoryObj } from "@storybook/nextjs";
import { ConfirmInline } from "./ConfirmInline";

const meta = {
  title: "UI/ConfirmInline",
  component: ConfirmInline,
  parameters: {
    layout: "centered",
  },
  decorators: [
    (Story) => (
      <div
        style={{
          width: 420,
          padding: "var(--space-4) var(--gutter-x)",
          background: "var(--mono-app-bg)",
          borderRadius: "var(--radius-3)",
          border: "1px solid var(--mono-border-subtle)",
        }}
      >
        <Story />
      </div>
    ),
  ],
  argTypes: {
    confirmVariant: {
      control: "select",
      options: ["danger", "primary"],
    },
  },
  args: {
    onConfirm: () => {},
    onCancel: () => {},
  },
} satisfies Meta<typeof ConfirmInline>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Destructive confirm — end jam / delete account / sign out. */
export const Danger: Story = {
  args: {
    prompt: (
      <p>
        End the jam for everyone? Final scores will be calculated and the jam
        will be closed. This cannot be undone.
      </p>
    ),
    confirmLabel: "Yes, end jam",
    pendingLabel: "Ending…",
    confirmVariant: "danger",
  },
};

/** Neutral commit — transfer ownership, publish set. */
export const Primary: Story = {
  args: {
    prompt: (
      <p>
        Transfer ownership to <strong>@elise_v</strong>? You&apos;ll still be
        a member of the crew but she becomes the new admin.
      </p>
    ),
    confirmLabel: "Transfer ownership",
    confirmVariant: "primary",
  },
};

/** Pending — both buttons disabled whilst the server action is in flight. */
export const Pending: Story = {
  args: {
    prompt: <p>Permanently delete this account and all associated data?</p>,
    confirmLabel: "Delete account",
    pendingLabel: "Deleting…",
    pending: true,
  },
};

/** Multi-paragraph prompt — the inline `strong` picks up the body typography. */
export const RichPrompt: Story = {
  args: {
    prompt: (
      <>
        <p>
          Sign out of <strong>@tom</strong> on this device?
        </p>
        <p>
          Your offline queue will be cleared. Unfinished logs from this session
          won&apos;t be recoverable.
        </p>
      </>
    ),
    confirmLabel: "Sign out",
    confirmVariant: "danger",
  },
};
