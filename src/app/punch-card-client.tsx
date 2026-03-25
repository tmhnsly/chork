"use client";

import { PunchCard } from "@/components/PunchCard/PunchCard";
import type { Set, Route, RouteLog } from "@/lib/data";

interface Props {
  set: Set;
  routes: Route[];
  initialLogs: RouteLog[];
}

export function PunchCardClient({ set, routes, initialLogs }: Props) {
  return <PunchCard set={set} routes={routes} initialLogs={initialLogs} />;
}
