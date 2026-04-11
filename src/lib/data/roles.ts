import type { GymRole } from "./types";

/** Roles that grant admin privileges (set management, route creation). */
export const ADMIN_ROLES: GymRole[] = ["admin", "owner", "setter"];

/** Check if a gym role has admin-level permissions. */
export function isGymAdmin(role: GymRole | null): boolean {
  return role !== null && ADMIN_ROLES.includes(role);
}
