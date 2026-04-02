import type { Meta, StoryObj } from "@storybook/nextjs";
import { RouteLogSheet } from "./RouteLogSheet";
import type { Set, Route, RouteLog } from "@/lib/data";
import { fn } from "storybook/test";

const mockSet: Set = {
  id: "set1",
  name: "Set 4",
  starts_at: "2026-04-07T00:00:00Z",
  ends_at: "2026-05-04T00:00:00Z",
  active: true,
  created: "2026-04-01T00:00:00Z",
  updated: "2026-04-01T00:00:00Z",
};

const mockRoute: Route = {
  id: "route3",
  set_id: "set1",
  number: 3,
  has_zone: true,
  created: "2026-04-01T00:00:00Z",
  updated: "2026-04-01T00:00:00Z",
};

const baseMockLog: RouteLog = {
  id: "log1",
  user_id: "user1",
  route_id: "route3",
  attempts: 0,
  completed: false,
  completed_at: null,
  grade_vote: null,
  zone: false,
  created: "2026-04-01T00:00:00Z",
  updated: "2026-04-01T00:00:00Z",
};

/** Bottom sheet that opens when a punch card tile is tapped. */
const meta = {
  title: "Components/RouteLogSheet",
  component: RouteLogSheet,
  args: {
    set: mockSet,
    route: mockRoute,
    onClose: fn(),
    onLogUpdate: fn(),
  },
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof RouteLogSheet>;

export default meta;
type Story = StoryObj<typeof meta>;

/** No previous log, fresh route. */
export const NotStarted: Story = {
  args: { log: null },
};

/** Has attempts, zone toggle visible and active. */
export const InProgress: Story = {
  args: {
    log: { ...baseMockLog, attempts: 3, zone: true },
  },
};

/** Completed with community grade shown. */
export const Completed: Story = {
  args: {
    log: {
      ...baseMockLog,
      attempts: 2,
      completed: true,
      completed_at: "2026-04-05T14:00:00Z",
      grade_vote: 4,
    },
  },
};

/** Flash completed. */
export const Flash: Story = {
  args: {
    log: {
      ...baseMockLog,
      attempts: 1,
      completed: true,
      completed_at: "2026-04-05T14:00:00Z",
      grade_vote: 3,
    },
  },
};
