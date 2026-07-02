import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs";
import { Collapse } from "./Collapse";
import { Button } from "../Button";

const meta = {
  title: "UI/Collapse",
  component: Collapse,
  parameters: { layout: "padded" },
} satisfies Meta<typeof Collapse>;

export default meta;
type Story = StoryObj<typeof meta>;

function Demo({ padTop, padBottom }: { padTop?: boolean; padBottom?: boolean }) {
  const [open, setOpen] = useState(true);
  return (
    <div style={{ maxWidth: 360 }}>
      <Button onClick={() => setOpen((v) => !v)} fullWidth>
        {open ? "Collapse" : "Expand"}
      </Button>
      <Collapse open={open} padTop={padTop} padBottom={padBottom}>
        <div
          style={{
            border: "1px solid var(--mono-border)",
            borderRadius: "var(--radius-2)",
            padding: "var(--space-3)",
          }}
        >
          Content of unknown height. Animates open and closed on every
          engine — grid-rows baseline, interpolate-size upgrade on
          Chromium. While collapsed this content is inert and
          aria-hidden.
        </div>
      </Collapse>
    </div>
  );
}

export const Default: Story = {
  args: { open: true, children: null },
  render: () => <Demo padTop />,
};

export const PadBottom: Story = {
  args: { open: true, children: null, padBottom: true },
  render: () => <Demo padBottom />,
};
