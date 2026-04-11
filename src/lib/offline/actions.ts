import {
  updateAttempts,
  completeRoute,
  uncompleteRoute,
  toggleZone,
  updateGradeVote,
} from "@/app/(app)/actions";
import { withOfflineQueue } from "./with-offline-queue";

export const offlineUpdateAttempts = withOfflineQueue(
  "updateAttempts",
  updateAttempts,
  (routeId) => routeId,
);

export const offlineCompleteRoute = withOfflineQueue(
  "completeRoute",
  completeRoute,
  (routeId) => routeId,
);

export const offlineUncompleteRoute = withOfflineQueue(
  "uncompleteRoute",
  uncompleteRoute,
  (routeId) => routeId,
);

export const offlineToggleZone = withOfflineQueue(
  "toggleZone",
  toggleZone,
  (routeId) => routeId,
);

export const offlineUpdateGradeVote = withOfflineQueue(
  "updateGradeVote",
  updateGradeVote,
  (routeId) => routeId,
);
