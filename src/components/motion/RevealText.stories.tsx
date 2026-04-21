import type { Meta, StoryObj } from "@storybook/nextjs";
import { RevealText } from "./RevealText";

// Regression surface for the iOS italic-clipping bug. Every story
// below exercises glyphs whose italic overhang was historically
// shaved — W / Y / K / T endings, periods after italic caps — at a
// range of display sizes. If the right edge of any glyph gets cut
// in any story, the RevealText mask is under-padded again.

const meta = {
  title: "Motion/RevealText",
  component: RevealText,
  parameters: { layout: "centered" },
} satisfies Meta<typeof RevealText>;

export default meta;
type Story = StoryObj<typeof meta>;

const displayStyle: React.CSSProperties = {
  fontFamily: "var(--font-heading)",
  fontWeight: 900,
  fontStyle: "italic",
  textTransform: "uppercase",
  letterSpacing: "-0.02em",
  lineHeight: 1.1,
  color: "var(--mono-text)",
  margin: 0,
};

export const WordEndingInK: Story = {
  args: { text: "CHORK" },
  decorators: [
    (Story) => (
      <div style={{ fontSize: 72, ...displayStyle }}>
        <Story />
      </div>
    ),
  ],
};

export const MultiWordWithPeriods: Story = {
  args: { text: "CLIMB IT. LOG IT. TOP IT." },
  decorators: [
    (Story) => (
      <div style={{ fontSize: 64, ...displayStyle }}>
        <Story />
      </div>
    ),
  ],
};

export const WordEndingInY: Story = {
  args: { text: "OFF THE WALL BABY" },
  decorators: [
    (Story) => (
      <div style={{ fontSize: 56, ...displayStyle }}>
        <Story />
      </div>
    ),
  ],
};

export const UsernameWithAt: Story = {
  args: { text: "@climber_tom" },
  decorators: [
    (Story) => (
      <div style={{ fontSize: 36, ...displayStyle, textTransform: "none" }}>
        <Story />
      </div>
    ),
  ],
};

/**
 * Responsive-clamp case — the most fragile one. Drop Storybook's
 * viewport to ~375px and confirm no glyph shaves at the narrow end.
 */
export const ResponsiveClamp: Story = {
  args: { text: "COMPETE WITH YOUR CREW." },
  decorators: [
    (Story) => (
      <div
        style={{
          ...displayStyle,
          fontSize: "clamp(1.875rem, 10vw, 3rem)",
        }}
      >
        <Story />
      </div>
    ),
  ],
};

/**
 * Demonstrates the `--reveal-overhang` tuning knob. If a future
 * heavier-italic font is used, consumers can widen the mask per-
 * instance without touching the component.
 */
export const CustomOverhang: Story = {
  args: { text: "WIDER MASK." },
  decorators: [
    (Story) => (
      <div
        style={
          {
            fontSize: 72,
            ...displayStyle,
            "--reveal-overhang": "0.8em",
          } as React.CSSProperties
        }
      >
        <Story />
      </div>
    ),
  ],
};
