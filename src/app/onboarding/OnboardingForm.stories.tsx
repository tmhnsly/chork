import type { Meta, StoryObj } from "@storybook/nextjs";
import { OnboardingForm } from "./onboarding-form";

/**
 * The onboarding form shown to new users after their first OAuth sign-in.
 * Collects username and display name before allowing access to the app.
 */
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
