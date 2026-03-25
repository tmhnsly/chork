import type { Meta, StoryObj } from "@storybook/nextjs";
import { FormField } from "./FormField";

const meta = {
  title: "UI/FormField",
  component: FormField,
  argTypes: {
    label: { control: "text", description: "Field label text" },
    error: { control: "text", description: "Validation error message" },
    placeholder: { control: "text" },
    type: { control: "select", options: ["text", "email", "password"] },
    required: { control: "boolean" },
    disabled: { control: "boolean" },
  },
  args: {
    id: "demo-field",
    label: "Username",
    placeholder: "your_username",
  },
  decorators: [
    (Story) => (
      <div style={{ width: 320 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof FormField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithValue: Story = {
  args: { label: "Display name", defaultValue: "Tom Hinsley", placeholder: "" },
};

export const WithError: Story = {
  args: { error: "Username is taken", defaultValue: "frog" },
};

export const Required: Story = {
  args: { label: "Username *", required: true },
};
