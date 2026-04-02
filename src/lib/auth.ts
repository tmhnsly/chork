import "server-only";
import { createServerPBFromCookies } from "./pocketbase-server";
import type { TypedPocketBase } from "./pocketbase-types";
export { cookieOptions } from "./cookie-config";

type AuthSuccess = { pb: TypedPocketBase; userId: string };
type AuthFailure = { error: string };

/**
 * Require authentication for a server action.
 * Returns the PB instance and user ID, or an error object.
 */
export async function requireAuth(): Promise<AuthSuccess | AuthFailure> {
  const pb = await createServerPBFromCookies();
  if (!pb.authStore.isValid || !pb.authStore.record) {
    return { error: "Not authenticated" };
  }
  return { pb, userId: pb.authStore.record.id };
}
