import type { Meta, StoryObj } from "@storybook/nextjs";
import { SheetBody } from "./SheetBody";
import { SheetActions } from "./SheetActions";
import { Button } from "./Button";

const meta = {
  title: "UI/SheetBody",
  component: SheetBody,
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
} satisfies Meta<typeof SheetBody>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Default gap + a simple text block + action row. */
export const Default: Story = {
  args: {
    children: (
      <>
        <p style={{ margin: 0 }}>
          This is the canonical sheet body — vertical stack with the default
          `var(--space-4)` gap between children.
        </p>
        <SheetActions>
          <Button fullWidth>Primary action</Button>
          <Button variant="secondary" fullWidth>
            Cancel
          </Button>
        </SheetActions>
      </>
    ),
  },
};

/** Bigger gap for sheets with heavier sections (climber peek, set detail). */
export const WideGap: Story = {
  args: {
    gap: 5,
    children: (
      <>
        <p style={{ margin: 0 }}>First block.</p>
        <p style={{ margin: 0 }}>Second block, spaced wider apart.</p>
        <p style={{ margin: 0 }}>Third block.</p>
      </>
    ),
  },
};

/** Horizontal action row for equal-weight cancel / confirm pairs. */
export const HorizontalActions: Story = {
  args: {
    children: (
      <>
        <p style={{ margin: 0 }}>Side-by-side buttons share the row width.</p>
        <SheetActions orientation="horizontal">
          <Button variant="secondary">Cancel</Button>
          <Button>Confirm</Button>
        </SheetActions>
      </>
    ),
  },
};

/** No trailing padding — use when the last child already owns its bottom space. */
export const Flush: Story = {
  args: {
    padBottom: "none",
    children: (
      <>
        <p style={{ margin: 0 }}>
          {`padBottom="none"`} — no trailing space. Useful for scrolling
          lists whose last row supplies its own padding.
        </p>
      </>
    ),
  },
};
