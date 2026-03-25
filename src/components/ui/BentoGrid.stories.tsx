import type { Meta, StoryObj } from "@storybook/nextjs";
import { FaChartBar, FaBolt, FaStar } from "react-icons/fa6";
import { BentoGrid, BentoCell, BentoStat } from "./BentoGrid";

const meta = {
  title: "Components/UI/BentoGrid",
  component: BentoGrid,
  argTypes: {
    columns: {
      control: "select",
      options: [2, 3, 4],
      description: "Number of grid columns",
    },
  },
  args: {
    columns: 2,
    children: null,
  },
} satisfies Meta<typeof BentoGrid>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Default 3-column layout with a full-span header cell and three stat cells below. */
export const ThreeColumn: Story = {
  render: (args) => (
    <BentoGrid {...args}>
      <BentoCell span="full" style={{ minHeight: 120 }}>
        Full-span header
      </BentoCell>
      <BentoStat label="Sends" value="42" />
      <BentoStat label="Flashes" value="17" />
      <BentoStat label="Points" value="128" />
    </BentoGrid>
  ),
};

/** 2-column layout with mixed span widths. */
export const TwoColumn: Story = {
  args: { columns: 2 },
  render: (args) => (
    <BentoGrid {...args}>
      <BentoCell span="full" style={{ minHeight: 100 }}>
        Full-span cell
      </BentoCell>
      <BentoCell span={1} style={{ minHeight: 80 }}>
        Span 1
      </BentoCell>
      <BentoCell span={1} style={{ minHeight: 80 }}>
        Span 1
      </BentoCell>
      <BentoCell span={2} style={{ minHeight: 80 }}>
        Span 2
      </BentoCell>
    </BentoGrid>
  ),
};

/** 4-column layout demonstrating all span sizes. */
export const FourColumn: Story = {
  args: { columns: 4 },
  render: (args) => (
    <BentoGrid {...args}>
      <BentoCell span="full" style={{ minHeight: 80 }}>
        Full span
      </BentoCell>
      <BentoCell span={3} style={{ minHeight: 80 }}>
        Span 3
      </BentoCell>
      <BentoCell span={1} style={{ minHeight: 80 }}>
        Span 1
      </BentoCell>
      <BentoCell span={2} style={{ minHeight: 80 }}>
        Span 2
      </BentoCell>
      <BentoCell span={2} style={{ minHeight: 80 }}>
        Span 2
      </BentoCell>
      <BentoCell span={1} style={{ minHeight: 80 }}>
        1
      </BentoCell>
      <BentoCell span={1} style={{ minHeight: 80 }}>
        1
      </BentoCell>
      <BentoCell span={1} style={{ minHeight: 80 }}>
        1
      </BentoCell>
      <BentoCell span={1} style={{ minHeight: 80 }}>
        1
      </BentoCell>
    </BentoGrid>
  ),
};

/** Side-by-side comparison of the default, accent, and flash cell variants. */
export const Variants: Story = {
  render: (args) => (
    <BentoGrid {...args}>
      <BentoCell variant="default" style={{ minHeight: 100 }}>
        Default
      </BentoCell>
      <BentoCell variant="accent" style={{ minHeight: 100 }}>
        Accent
      </BentoCell>
      <BentoCell variant="flash" style={{ minHeight: 100 }}>
        Flash
      </BentoCell>
    </BentoGrid>
  ),
};

/** BentoStat cells with icons showcasing each variant. */
export const StatCells: Story = {
  render: (args) => (
    <BentoGrid {...args}>
      <BentoStat label="Total Sends" value="42" icon={<FaChartBar />} />
      <BentoStat label="Streak" value="7 days" icon={<FaStar />} variant="accent" />
      <BentoStat label="Flashes" value="12" icon={<FaBolt />} variant="flash" />
    </BentoGrid>
  ),
};
