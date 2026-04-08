import type PocketBase from "pocketbase";
import type { UsersResponse } from "./pocketbase-types";

/**
 * Runtime type guard for the PocketBase auth record.
 * Verifies the shape matches UsersResponse before narrowing.
 */
function isUsersResponse(record: unknown): record is UsersResponse {
  if (record === null || typeof record !== "object") return false;
  const r = record as Record<string, unknown>;
  return (
    typeof r.id === "string" &&
    typeof r.username === "string" &&
    typeof r.email === "string" &&
    typeof r.collectionId === "string" &&
    typeof r.created === "string" &&
    typeof r.updated === "string"
  );
}

/**
 * Extract a typed UsersResponse from pb.authStore.record.
 * Uses a runtime type guard — no unsafe casts.
 * Throws if the record is present but has the wrong shape,
 * since a malformed auth record is a bug, not an expected state.
 */
export function getAuthUser(pb: PocketBase): UsersResponse | null {
  if (!pb.authStore.isValid || !pb.authStore.record) {
    return null;
  }
  const record = pb.authStore.record;
  if (!isUsersResponse(record)) {
    throw new Error(
      "[chork] Auth record is present but does not match UsersResponse shape. " +
      "This likely means the PocketBase schema changed or the auth store is corrupt."
    );
  }
  return record;
}

/** Check if a user has completed onboarding. */
export function isOnboarded(user: UsersResponse): boolean {
  return user.onboarded === true;
}
