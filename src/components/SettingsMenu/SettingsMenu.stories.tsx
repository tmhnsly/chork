import type { Meta, StoryObj } from "@storybook/nextjs";
import { FaPen, FaRightFromBracket, FaTrash, FaGear } from "react-icons/fa6";
import { DropdownMenu } from "./SettingsMenu";
import { fn } from "storybook/test";

/** Reusable dropdown menu with glassmorphism panel and item variants. */
const meta = {
  title: "Components/DropdownMenu",
  component: DropdownMenu,
  parameters: { layout: "centered" },
} satisfies Meta<typeof DropdownMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    trigger: (
      <button style={{ padding: "8px", border: "1px solid var(--mono-border)", borderRadius: "var(--radius-2)", background: "transparent", color: "var(--mono-text)", cursor: "pointer" }}>
        <FaGear />
      </button>
    ),
    groups: [
      {
        items: [
          { label: "Edit profile", icon: <FaPen />, onSelect: fn() },
        ],
      },
      {
        items: [
          { label: "Sign out", icon: <FaRightFromBracket />, variant: "warning", onSelect: fn() },
          { label: "Delete account", icon: <FaTrash />, variant: "danger", onSelect: fn() },
        ],
      },
    ],
  },
};
