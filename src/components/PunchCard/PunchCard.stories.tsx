import type { Meta, StoryObj } from "@storybook/nextjs";
import type { Set, Route, RouteLog } from "@/lib/data";
import { PunchCard } from "./PunchCard";

const mockSet: Set = {
  id: "set_001",
  name: "April 2026",
  starts_at: "2026-04-07T00:00:00Z",
  ends_at: "2026-05-04T00:00:00Z",
  active: true,
  created: "2026-04-01T00:00:00Z",
  updated: "2026-04-01T00:00:00Z",
};

const mockRoutes: Route[] = Array.from({ length: 12 }, (_, i) => ({
  id: `route_${String(i + 1).padStart(3, "0")}`,
  set_id: mockSet.id,
  number: i + 1,

  has_zone: i % 3 === 0,
  created: "2026-04-07T00:00:00Z",
  updated: "2026-04-07T00:00:00Z",
}));

function makeLog(
  routeIndex: number,
  attempts: number,
  completed: boolean,
  zone = false,
): RouteLog {
  return {
    id: `log_${String(routeIndex + 1).padStart(3, "0")}`,
    user_id: "user_001",
    route_id: mockRoutes[routeIndex].id,
    attempts,
    completed,
    completed_at: completed ? "2026-04-10T14:30:00Z" : null,
    grade_vote: null,
    zone,
    created: "2026-04-10T14:00:00Z",
    updated: "2026-04-10T14:30:00Z",
  };
}

/** In-progress logs: mix of empty, attempted, completed, and flash states. */
const inProgressLogs: RouteLog[] = [
  makeLog(0, 1, true),   // route 1 — flash
  makeLog(1, 3, true),   // route 2 — completed (3 attempts)
  makeLog(2, 2, false),  // route 3 — attempted, not completed
  makeLog(4, 1, true),   // route 5 — flash
  makeLog(5, 5, true),   // route 6 — completed (5 attempts)
  makeLog(7, 1, false),  // route 8 — attempted (1 attempt, not completed)
  makeLog(9, 2, true),   // route 10 — completed (2 attempts)
  // routes 4, 7, 9, 11, 12 have no logs (empty)
];

/** All routes completed, with some flashes mixed in. */
const allCompletedLogs: RouteLog[] = [
  makeLog(0, 1, true),   // flash
  makeLog(1, 2, true),
  makeLog(2, 1, true),   // flash
  makeLog(3, 4, true),
  makeLog(4, 1, true),   // flash
  makeLog(5, 3, true),
  makeLog(6, 2, true),
  makeLog(7, 1, true),   // flash
  makeLog(8, 5, true),
  makeLog(9, 2, true),
  makeLog(10, 3, true),
  makeLog(11, 1, true),  // flash
];

/** Punch card grid showing route completion progress for a set. */
const meta = {
  title: "Components/PunchCard",
  component: PunchCard,
  parameters: {
    layout: "padded",
  },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 560 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof PunchCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Fresh punch card with no logged attempts. */
export const Empty: Story = {
  args: {
    set: mockSet,
    routes: mockRoutes,
    initialLogs: [],
  },
};

/** Partially completed card with a mix of empty, attempted, completed, and flash tiles. */
export const InProgress: Story = {
  args: {
    set: mockSet,
    routes: mockRoutes,
    initialLogs: inProgressLogs,
  },
};

/** Every route completed, several with flash badges. */
export const AllCompleted: Story = {
  args: {
    set: mockSet,
    routes: mockRoutes,
    initialLogs: allCompletedLogs,
  },
};
