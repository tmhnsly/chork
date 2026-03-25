import type { Meta, StoryObj } from "@storybook/nextjs";
import styles from "./user.module.scss";

interface PreviousSetCardProps {
  label: string;
  points: number;
  completions: number;
  flashes: number;
}

/** Inline presentational component matching the `.setCard` styles from the user page. */
function PreviousSetCard({ label, points, completions, flashes }: PreviousSetCardProps) {
  return (
    <div className={styles.setCard}>
      <span className={styles.setLabel}>{label}</span>
      <div className={styles.setStats}>
        <div className={styles.setStat}>
          <span className={styles.setStatValue}>{points}</span>
          <span className={styles.setStatLabel}>Points</span>
        </div>
        <div className={styles.setStat}>
          <span className={styles.setStatValue}>{completions}</span>
          <span className={styles.setStatLabel}>Completions</span>
        </div>
        <div className={styles.setStat}>
          <span className={`${styles.setStatValue} ${styles.flashValue}`}>{flashes}</span>
          <span className={styles.setStatLabel}>Flashes</span>
        </div>
      </div>
    </div>
  );
}

/** Previous set summary card shown on a user's profile page. */
const meta = {
  title: "App/PreviousSetCard",
  component: PreviousSetCard,
  parameters: {
    layout: "padded",
  },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 500 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof PreviousSetCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A typical completed set with a mix of flashes and multi-attempt sends. */
export const Default: Story = {
  args: {
    label: "APR 7 \u2013 MAY 4",
    points: 32,
    completions: 10,
    flashes: 4,
  },
};

/** Every route was flashed — maximum points per completion. */
export const AllFlashes: Story = {
  args: {
    label: "MAR 3 \u2013 MAR 30",
    points: 48,
    completions: 12,
    flashes: 12,
  },
};

/** No flashes at all — all completions took multiple attempts. */
export const NoFlashes: Story = {
  args: {
    label: "FEB 3 \u2013 MAR 2",
    points: 8,
    completions: 6,
    flashes: 0,
  },
};
