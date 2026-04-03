import type { Meta, StoryObj } from "@storybook/nextjs";
import { RouteLogSheet } from "./RouteLogSheet";
import { Collections } from "@/lib/pocketbase-types";
import { mockRouteSet, mockRoute, mockRouteLog } from "@/test/mocks";
import { fn } from "storybook/test";

const set = mockRouteSet({ id: "set1", collectionName: Collections.Sets });

const route = mockRoute({
  id: "route3",
  collectionName: Collections.Routes,
  set_id: "set1",
  number: 3,
  has_zone: true,
});

const baseLog = mockRouteLog({
  id: "log1",
  collectionName: Collections.RouteLogs,
  user_id: "user1",
  route_id: "route3",
});

const meta = {
  title: "Components/RouteLogSheet",
  component: RouteLogSheet,
  args: {
    set,
    route,
    onClose: fn(),
    onLogUpdate: fn(),
  },
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof RouteLogSheet>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NotStarted: Story = {
  args: { log: null },
};

export const InProgress: Story = {
  args: { log: { ...baseLog, attempts: 3, zone: true } },
};

export const Completed: Story = {
  args: {
    log: { ...baseLog, attempts: 2, completed: true, completed_at: "2026-04-05T14:00:00Z", grade_vote: 4 },
  },
};

export const Flash: Story = {
  args: {
    log: { ...baseLog, attempts: 1, completed: true, completed_at: "2026-04-05T14:00:00Z", grade_vote: 3 },
  },
};
