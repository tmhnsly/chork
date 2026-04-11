import type { Meta, StoryObj } from "@storybook/nextjs";
import { StatsWidget } from "./StatsWidget";
import { mockRouteLog } from "@/test/mocks";

const routeIds = Array.from({ length: 14 }, (_, i) => `route_${i + 1}`);
const routeHasZone = routeIds.map((_, i) => i % 3 === 0);

const logs = new Map([
  ["route_1", mockRouteLog({ id: "l1", user_id: "u1", route_id: "route_1", attempts: 1, completed: true })],
  ["route_2", mockRouteLog({ id: "l2", user_id: "u1", route_id: "route_2", attempts: 3, completed: true })],
  ["route_4", mockRouteLog({ id: "l3", user_id: "u1", route_id: "route_4", attempts: 1, completed: true, zone: true })],
  ["route_5", mockRouteLog({ id: "l4", user_id: "u1", route_id: "route_5", attempts: 2, completed: false })],
]);

const meta = {
  title: "Components/StatsWidget",
  component: StatsWidget,
  parameters: { layout: "padded" },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 500 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof StatsWidget>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Mid-session with some completions. */
export const InProgress: Story = {
  args: {
    completions: 3,
    total: 14,
    flashes: 2,
    points: 12,
    logs,
    routeIds,
    routeHasZone,
    resetDate: "May 6",
  },
};

/** Empty — no attempts logged yet. */
export const Empty: Story = {
  args: {
    completions: 0,
    total: 14,
    flashes: 0,
    points: 0,
    logs: new Map(),
    routeIds,
    routeHasZone,
    resetDate: "May 6",
  },
};
