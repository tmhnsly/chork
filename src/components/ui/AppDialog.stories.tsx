import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs";
import { AppDialog } from "./AppDialog";
import { Button } from "./Button";

function DialogDemo() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Open dialog</Button>
      <AppDialog open={open} onOpenChange={setOpen} title="Example dialog">
        <h2 style={{ fontWeight: 700 }}>Dialog title</h2>
        <p style={{ color: "var(--mono-text-low-contrast)", fontSize: "var(--text-sm)" }}>
          This is a reusable centred dialog with overlay, shadow, and animation.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          <Button onClick={() => setOpen(false)} fullWidth>Confirm</Button>
          <Button variant="ghost" onClick={() => setOpen(false)} fullWidth>Cancel</Button>
        </div>
      </AppDialog>
    </>
  );
}

/** Reusable centred dialog — wraps Radix Dialog with consistent overlay, shadow, and animation. */
const meta = {
  title: "UI/AppDialog",
  component: DialogDemo,
  parameters: { layout: "centered" },
} satisfies Meta<typeof DialogDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
