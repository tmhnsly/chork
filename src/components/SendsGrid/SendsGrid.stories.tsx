import type { Meta, StoryObj } from "@storybook/nextjs";
import { mockRouteSet, mockRoute, mockRouteLog } from "@/test/mocks";
import { SendsGrid } from "./SendsGrid";

const set = mockRouteSet({ id: "set_001", gym_id: "gym_001" });

const routes = Array.from({ length: 12 }, (_, i) =>
  mockRoute({
    id: `route_${String(i + 1).padStart(3, "0")}`,
    set_id: set.id,
    number: i + 1,
    has_zone: i % 3 === 0,
  })
);

function makeLog(routeIndex: number, attempts: number, completed: boolean, zone = false) {
  return mockRouteLog({
    id: `log_${String(routeIndex + 1).padStart(3, "0")}`,
    user_id: "user_001",
    route_id: routes[routeIndex].id,
    attempts,
    completed,
    completed_at: completed ? "2026-04-10T14:30:00Z" : null,
    zone,
  });
}

const inProgressLogs = [
  makeLog(0, 1, true),
  makeLog(1, 3, true),
  makeLog(2, 2, false),
  makeLog(4, 1, true),
  makeLog(5, 5, true),
  makeLog(7, 1, false),
  makeLog(9, 2, true),
];

const allCompletedLogs = Array.from({ length: 12 }, (_, i) =>
  makeLog(i, i % 3 === 0 ? 1 : i + 1, true)
);

const meta = {
  title: "Components/SendsGrid",
  component: SendsGrid,
  parameters: { layout: "padded" },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 560 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SendsGrid>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  args: { set, routes, initialLogs: [] },
};

export const InProgress: Story = {
  args: { set, routes, initialLogs: inProgressLogs },
};

export const AllCompleted: Story = {
  args: { set, routes, initialLogs: allCompletedLogs },
};
