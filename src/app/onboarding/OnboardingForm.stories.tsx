import type { Meta, StoryObj } from "@storybook/nextjs";
import { OnboardingForm } from "./onboarding-form";

/** Onboarding form — collects username, display name, and gym selection. */
const meta = {
  title: "Pages/Onboarding",
  component: OnboardingForm,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof OnboardingForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
