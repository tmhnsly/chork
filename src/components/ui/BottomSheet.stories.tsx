import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs";
import { BottomSheet } from "./BottomSheet";
import { Button } from "./Button";
import { SheetBody } from "./SheetBody";
import { TabPills } from "./TabPills";

function Demo({
  title,
  description,
  size,
  withSubheader,
  bodyText,
}: {
  title: string;
  description?: string;
  size?: "default" | "tall";
  withSubheader?: boolean;
  bodyText: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Open sheet</Button>
      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        title={title}
        description={description}
        size={size}
        subheader={
          withSubheader ? (
            <TabPills
              ariaLabel="Filter"
              layout="wrap"
              options={[
                { value: "all", label: "All" },
                { value: "mine", label: "Mine" },
                { value: "open", label: "Open" },
              ]}
              value="all"
              onChange={() => {}}
            />
          ) : undefined
        }
      >
        <SheetBody>
          <p style={{ margin: 0 }}>{bodyText}</p>
          <Button onClick={() => setOpen(false)} fullWidth>
            Close
          </Button>
        </SheetBody>
      </BottomSheet>
    </>
  );
}

/**
 * Bottom sheet — the foundational sheet primitive used by every
 * climber-facing surface that slides up from the bottom of the
 * viewport. Owns the title bar, close button, overlay, focus trap,
 * and ESC handling. Pair with `<SheetBody>` for the inner stack.
 */
const meta = {
  title: "UI/BottomSheet",
  component: Demo,
  parameters: { layout: "centered" },
} satisfies Meta<typeof Demo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    title: "Notifications",
    description: "Recent activity and crew invites",
    bodyText: "Sheet content lives inside SheetBody for the canonical inner stack + trailing safe-area padding.",
  },
};

export const Tall: Story = {
  args: {
    title: "All achievements",
    description: "Every badge in one panel",
    size: "tall",
    bodyText: "The 'tall' size variant caps just below the top safe-area inset — use it for content-heavy sheets that benefit from more vertical room.",
  },
};

export const WithSubheader: Story = {
  args: {
    title: "Activity",
    description: "Crew activity feed",
    withSubheader: true,
    bodyText: "Sticky subheader stays pinned at the top while the body scrolls underneath. Use for filter pills or segmented tabs that the user shouldn't have to scroll back up to re-select.",
  },
};
